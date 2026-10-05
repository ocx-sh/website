// `task bunny:purge -- --zone <z> [<path>]`: purges a pull zone's cache, by path prefix or whole. Emergency use only:
// CI never purges (the TTL is 60 s) and never holds the account key, so `createClient` refuses on CI.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { EXIT, createClient, findByName } from './api.mjs';
import { zoneSpec } from './zones.mjs';

/**
 * @typedef {object} MainOptions
 * @property {string[]} argv
 * @property {Record<string, string | undefined>} env
 * @property {(text: string) => void} out the result
 * @property {(text: string) => void} err messages about the run
 * @property {typeof globalThis.fetch} [fetch] injected in tests
 * @property {string} [baseUrl] API origin, injected in tests
 */

/**
 * The prefix to purge: `/docs/` purges everything under it. Refuses what could name another URL: no leading
 * `/`, a second leading `/`, a query, a fragment, `..` or whitespace.
 * @param {string} path
 * @returns {string}
 */
function prefixOf(path) {
  if (!path.startsWith('/') || /^\/\/|[\s?#\\]|\.\./.test(path))
    throw new Error(`invalid path ${JSON.stringify(path)}: expected /<prefix>`);
  return path.endsWith('*') ? path : `${path}*`;
}

/**
 * Purges one zone. Exit 0 on success, 1 on a refusal (CI, empty key, unknown pull zone, API failure), 2 on bad
 * arguments. Without a path the whole zone is purged. A path is purged as a prefix on every hostname the zone
 * serves, because the cache is keyed per host.
 * ponytail: `POST /purge?url=<url>*` and `POST /pullzone/<id>/purgeCache` follow the documented purge API and
 * the "cache keyed per host" reading is unverified; re-check both against a recorded purge run
 * (infra/bunny/README.md, "M0: Bunny probes"): a purge on the wrong key leaves stale pages cached.
 * @param {MainOptions} options
 * @returns {Promise<number>}
 */
export async function main({ argv, env, out, err, fetch, baseUrl }) {
  /** @type {string} */
  let zone;
  /** @type {string | undefined} */
  let prefix;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { zone: { type: 'string' } },
      allowPositionals: true,
    });
    zone = values.zone ?? '';
    zoneSpec(zone);
    if (positionals.length > 1) throw new Error('give at most one path');
    if (positionals[0] !== undefined) prefix = prefixOf(positionals[0]);
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\nusage: purge.mjs --zone <dev|prod|preview:<slug>> [<path>]\n`);
    return EXIT.usage;
  }

  try {
    const { pull } = zoneSpec(zone);
    const client = createClient(env, { ...(fetch ? { fetch } : {}), ...(baseUrl ? { baseUrl } : {}) });
    const found = findByName(await client.get('/pullzone'), pull);
    if (typeof found?.Id !== 'number' || !Array.isArray(found.Hostnames)) throw new Error(`no pull zone named ${pull}`);

    if (prefix === undefined) {
      await client.post(`/pullzone/${found.Id}/purgeCache`);
      out(`${pull}: whole cache purged\n`);
      return EXIT.ok;
    }
    const hosts = /** @type {{ Value?: unknown }[]} */ (found.Hostnames).map((h) => String(h.Value));
    for (const host of hosts) {
      await client.post(`/purge?${new URLSearchParams({ url: `https://${host}${prefix}` })}`);
      out(`${pull}: purged https://${host}${prefix}\n`);
    }
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
