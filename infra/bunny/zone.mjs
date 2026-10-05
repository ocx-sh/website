// `task bunny:zone:apply -- --zone <z>`: creates a pull zone when absent, sets its settings, default origin and
// Force SSL, then reads every value back. The API answers 200 for a body it partly ignores, so a write is only
// proven by the read-back (.agents/adr/adr_0002_phase2-bunny-cutover.md#d63-apply-semantics).
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { EXIT, RefusalError, createClient, findByName } from './api.mjs';
import { PUBLIC_HOST, zoneSpec } from './zones.mjs';

// ponytail: documented value (`OriginType` 2 = storage zone); re-check it against a recorded pull-zone response
// (infra/bunny/README.md, "Record a response").
const ORIGIN_TYPE_STORAGE = 2;

/**
 * The settings every zone gets. `AddHostHeader` is off so a legacy proxy reaches Pages with
 * `Host: ocx-website.pages.dev`; request coalescing is off so a merged in-flight response never hands one
 * user another's. Prod has no per-IP rate limit: every visitor reaches Bunny as the same nginx host.
 * The bandwidth cap is the owner's, never set here.
 * ponytail: field names follow the documented pull-zone API (`CacheControlMaxAgeOverride` edge seconds,
 * `CacheControlPublicMaxAgeOverride` browser seconds, `RequestLimit` 0 = unlimited). Unverified: whether
 * browser `0` means `no-cache` or "respect origin"; re-check both against a recorded pull-zone response
 * (infra/bunny/README.md, "Record a response").
 * @param {string} zone `dev`, `prod` or `preview:<slug>`
 * @returns {Record<string, string | number | boolean>}
 */
export function zoneSettings(zone) {
  return {
    CacheControlMaxAgeOverride: 60,
    CacheControlPublicMaxAgeOverride: 0,
    CacheErrorResponses: false,
    EnableOriginShield: true,
    EnableSafeHop: true,
    OriginRetries: 2,
    // An enum (0, 1, 3, 5, 10 seconds): any other value is silently clamped to the nearest.
    OriginRetryDelay: 1,
    OriginRetry5XXResponses: true,
    UseStaleWhileUpdating: true,
    UseStaleWhileOffline: true,
    EnableRequestCoalescing: false,
    AddHostHeader: false,
    ...(zone === 'prod' ? { RequestLimit: 0 } : {}),
  };
}

/**
 * @typedef {object} MainOptions
 * @property {string[]} argv
 * @property {Record<string, string | undefined>} env
 * @property {(text: string) => void} out the result
 * @property {(text: string) => void} err messages about the run
 * @property {typeof globalThis.fetch} [fetch] injected in tests
 * @property {string} [baseUrl] API origin, injected in tests
 */

/** @typedef {{ Value?: unknown, ForceSSL?: unknown, HasCertificate?: unknown }} Hostname */
/** @typedef {{ Id: number, Hostnames: Hostname[] } & Record<string, unknown>} Zone */

/**
 * @param {unknown} zone
 * @returns {Zone}
 */
function asZone(zone) {
  const z = /** @type {{ Id?: unknown, Hostnames?: unknown } | null} */ (zone);
  if (typeof z?.Id !== 'number' || !Array.isArray(z.Hostnames))
    throw new Error('pull zone response has no Id and Hostnames');
  return /** @type {Zone} */ (zone);
}

/**
 * The refusals of a zone against what was asked: a field the GET does not carry, a differing value, a
 * hostname without a certificate or Force SSL.
 * @param {Zone} zone
 * @param {Record<string, unknown>} want
 * @returns {string[]}
 */
function problems(zone, want) {
  return [
    ...Object.entries(want).flatMap(([k, v]) =>
      !(k in zone)
        ? [`${k}: missing from the pull zone response`]
        : zone[k] === v
          ? []
          : [`${k}: is ${JSON.stringify(zone[k])}, wanted ${JSON.stringify(v)}`],
    ),
    ...zone.Hostnames.flatMap((h) => [
      ...(h.HasCertificate === true ? [] : [`${String(h.Value)}: has no certificate`]),
      ...(h.ForceSSL === true ? [] : [`${String(h.Value)}: Force SSL is off`]),
    ]),
  ];
}

/**
 * Reconciles a zone. Exit 0 on success, 1 on a refusal (CI, empty key, no storage zone, a field the API
 * lacks or ignored, a hostname without certificate or Force SSL, API failure), 2 on bad arguments. Nothing
 * is written when the storage zone or a requested field is missing. It never adds a hostname.
 * @param {MainOptions} options
 * @returns {Promise<number>}
 */
export async function main({ argv, env, out, err, fetch, baseUrl }) {
  /** @type {string} */
  let zone;
  try {
    const { values } = parseArgs({ args: argv, options: { zone: { type: 'string' } } });
    zone = values.zone ?? '';
    zoneSpec(zone);
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\nusage: zone.mjs --zone <dev|prod|preview:<slug>>\n`);
    return EXIT.usage;
  }

  try {
    const { pull, storage, hosts } = zoneSpec(zone);
    const client = createClient(env, { ...(fetch ? { fetch } : {}), ...(baseUrl ? { baseUrl } : {}) });
    const storageZone = findByName(await client.get('/storagezone'), storage);
    if (typeof storageZone?.Id !== 'number')
      throw new RefusalError(`no storage zone named ${storage}: run bunny:onboard first`);
    const want = { OriginType: ORIGIN_TYPE_STORAGE, StorageZoneId: storageZone.Id, ...zoneSettings(zone) };

    let found = findByName(await client.get('/pullzone'), pull);
    if (!found) {
      found = /** @type {Record<string, unknown>} */ (await client.post('/pullzone', { Name: pull, ...want }));
      out(`created pull zone ${pull}\n`);
    }
    const live = asZone(await client.get(`/pullzone/${String(found.Id)}`));

    const missing = Object.keys(want).filter((k) => !(k in live));
    if (missing.length > 0)
      throw new RefusalError(`${pull}: pull zone has no such field(s): ${missing.join(', ')}; no write sent`);
    const changes = Object.entries(want).filter(([k, v]) => live[k] !== v);
    for (const [k, v] of changes) out(`${k}: ${JSON.stringify(live[k])} -> ${JSON.stringify(v)}\n`);
    if (changes.length > 0) await client.post(`/pullzone/${live.Id}`, Object.fromEntries(changes));

    // A hostname without a certificate cannot take Force SSL; the read-back reports it.
    for (const h of live.Hostnames)
      if (h.ForceSSL !== true && h.HasCertificate === true) {
        await client.post(`/pullzone/${live.Id}/setForceSSL`, { Hostname: h.Value, ForceSSL: true });
        out(`${String(h.Value)}: Force SSL on\n`);
      }

    const back = asZone(await client.get(`/pullzone/${live.Id}`));
    for (const host of hosts)
      if (!back.Hostnames.some((h) => h.Value === host))
        out(`${host}: not on the zone yet, the owner adds it in the dashboard\n`);
    // Exit stays 0: the owner adds `ocx.sh` at the cutover. The line lets a script or reader tell it from done.
    if (zone === 'prod' && !back.Hostnames.some((h) => h.Value === PUBLIC_HOST))
      out(`PENDING: ${PUBLIC_HOST} hostname not on the zone (OG-P)\n`);
    const left = problems(back, want);
    if (left.length > 0) throw new RefusalError(`read-back differs:\n${left.join('\n')}`);
    out(`${pull}: ${Object.keys(want).length} fields, ${changes.length} changed, read back equal\n`);
    return EXIT.ok;
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\n`);
    return EXIT.refused;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    env: process.env,
    out: (t) => process.stdout.write(t),
    err: (t) => process.stderr.write(t),
  });
}
