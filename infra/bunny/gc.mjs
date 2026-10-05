// `task bunny:gc -- --zone <z> --older-than <n>d|h [--dry-run]`: deletes unreferenced non-HTML files (hashed `_astro/`
// assets, Pagefind chunks) that no recent deploy re-uploaded. A deploy never deletes them, so a cached page
// can never name a missing asset; only this owner-local task does, long after every TTL.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { listRecursive, remove } from '../../.github/actions/deploy/storage.mjs';
import { EXIT, RefusalError, createClient, findByName } from './api.mjs';
import { storageZoneName, zoneSpec } from './zones.mjs';

const HOUR_MS = 3_600_000;
const UNIT_MS = { h: HOUR_MS, d: 24 * HOUR_MS };
// ponytail: the DE storage endpoint (REGION.primary); the list response carries `LastChanged` as UTC without a
// zone suffix. Both are the documented shapes: re-check them against a recorded storage listing
// (infra/bunny/README.md, "Record a response"); a wrong zone suffix shifts every file's age by the UTC offset.
const STORAGE_HOST = 'storage.bunnycdn.com';
const ERROR_DIR = 'bunnycdn_errors/';

/**
 * @typedef {object} MainOptions
 * @property {string[]} argv
 * @property {Record<string, string | undefined>} env
 * @property {(text: string) => void} out the result
 * @property {(text: string) => void} err messages about the run
 * @property {typeof globalThis.fetch} [fetch] management API, injected in tests
 * @property {string} [baseUrl] API origin, injected in tests
 * @property {(url: string, init?: RequestInit) => Promise<Response>} [storageFetch] storage API, injected in tests
 * @property {number} [now] epoch milliseconds, injected in tests
 */

/**
 * Epoch milliseconds of a Bunny `LastChanged`. Throws on anything unparsable: a file whose age is unknown is kept.
 * @param {unknown} value
 * @param {string} what for the error message
 * @returns {number}
 */
function changedAt(value, what) {
  const ms = typeof value === 'string' ? Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`) : NaN;
  if (Number.isNaN(ms)) throw new Error(`${what}: LastChanged ${JSON.stringify(value)} is not a date`);
  return ms;
}

/**
 * Zone-relative claim prefixes, `''` for the root claim. `own` are the claims whose files live in this zone;
 * `all` also holds every other repo's claim, so a file under one of those is never taken for the root claim's.
 * A preview zone holds one site at `/`.
 * @param {string} zone `dev`, `prod` or `preview:<slug>`
 * @returns {{ own: string[], all: string[] }}
 */
function claimPrefixes(zone) {
  if (zone.startsWith('preview:')) return { own: [''], all: [''] };
  const { storage } = zoneSpec(zone);
  const all = nav.claims.map((c) => c.path.slice(1));
  return { own: nav.claims.filter((c) => storageZoneName(c.repo) === storage).map((c) => c.path.slice(1)), all };
}

/** @typedef {{ rel: string, entry: import('../../.github/actions/deploy/storage.mjs').StorageEntry & { LastChanged?: unknown } }} GcFile a listed file: zone-relative path and its entry */

/**
 * The files `gc` deletes. Per claim, judged against its own `index.html`: a claim without one, or whose one is
 * younger than an hour (a deploy may be running), is skipped whole. A file goes only when it is older than
 * `olderThan` and more than an hour older than that index (a deploy that still listed it re-uploaded it).
 * HTML, `bunnycdn_errors/` and files under another repo's claim never go.
 * @param {GcFile[]} files every file listed in the zone
 * @param {{ own: string[], all: string[] }} prefixes see `claimPrefixes`
 * @param {number} olderThan milliseconds
 * @param {number} now
 * @returns {{ doomed: GcFile[], skipped: string[] }}
 */
export function plan(files, { own, all }, olderThan, now) {
  const owner = (/** @type {string} */ rel) =>
    all.filter((p) => rel.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  /** @type {GcFile[]} */
  const doomed = [];
  /** @type {string[]} */
  const skipped = [];
  for (const prefix of own) {
    const index = files.find((f) => f.rel === `${prefix}index.html`);
    const label = `/${prefix}`;
    if (!index) {
      skipped.push(`${label}: no live index.html`);
      continue;
    }
    const live = changedAt(index.entry.LastChanged, index.rel);
    if (now - live < HOUR_MS) {
      skipped.push(`${label}: index.html is younger than 1 h`);
      continue;
    }
    for (const f of files) {
      if (owner(f.rel) !== prefix || /\.html$/i.test(f.rel) || f.rel.startsWith(ERROR_DIR)) continue;
      const at = changedAt(f.entry.LastChanged, f.rel);
      if (now - at > olderThan && live - at > HOUR_MS) doomed.push(f);
    }
  }
  return { doomed, skipped };
}

/**
 * Collects stale assets of one storage zone. Exit 0 on success (`--dry-run` lists and deletes nothing, GET only),
 * 1 on a refusal (CI, empty key, no storage zone, an unreadable date, a failed delete), 2 on bad arguments.
 * @param {MainOptions} options
 * @returns {Promise<number>}
 */
export async function main({ argv, env, out, err, fetch, baseUrl, storageFetch, now = Date.now() }) {
  /** @type {string} */
  let zone;
  /** @type {number} */
  let olderThan;
  /** @type {boolean} */
  let dryRun;
  try {
    const { values } = parseArgs({
      args: argv,
      options: { zone: { type: 'string' }, 'older-than': { type: 'string' }, 'dry-run': { type: 'boolean' } },
    });
    zone = values.zone ?? '';
    zoneSpec(zone);
    const m = /^([1-9]\d*)([dh])$/.exec(values['older-than'] ?? '');
    if (!m) throw new Error('--older-than is required: <n>d or <n>h');
    olderThan = Number(m[1]) * UNIT_MS[/** @type {'d' | 'h'} */ (m[2])];
    dryRun = values['dry-run'] === true;
  } catch (e) {
    err(
      `${e instanceof Error ? e.message : String(e)}\nusage: gc.mjs --zone <dev|prod|preview:<slug>> --older-than <n>d|<n>h [--dry-run]\n`,
    );
    return EXIT.usage;
  }

  /** @type {string} */
  let password = '';
  try {
    const { storage } = zoneSpec(zone);
    const client = createClient(env, { ...(fetch ? { fetch } : {}), ...(baseUrl ? { baseUrl } : {}) });
    const found = findByName(await client.get('/storagezone'), storage);
    if (typeof found?.Password !== 'string' || found.Password === '')
      throw new RefusalError(`no storage zone named ${storage}: run bunny:onboard first`);
    password = found.Password;

    const store = {
      host: STORAGE_HOST,
      zone: storage,
      accessKey: password,
      ...(storageFetch ? { fetch: storageFetch } : {}),
    };
    const root = `/${storage}/`;
    const files = (await listRecursive(store))
      .filter((e) => !e.IsDirectory)
      .map((entry) => ({ rel: `${entry.Path.slice(root.length)}${entry.ObjectName}`, entry }));
    const { doomed, skipped } = plan(files, claimPrefixes(zone), olderThan, now);

    for (const s of skipped) out(`skip ${s}\n`);
    for (const f of doomed) {
      out(`${dryRun ? 'would delete' : 'delete'} ${f.rel}\n`);
      if (!dryRun) await remove(store, f.entry);
    }
    out(`${storage}: ${doomed.length} of ${files.length} files ${dryRun ? 'would be deleted' : 'deleted'}\n`);
    return EXIT.ok;
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    err(`${password ? text.split(password).join('***') : text}\n`);
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
