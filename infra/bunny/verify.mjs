// `task bunny:verify -- --zone <z> [--host <h>]`: probes one host of a zone (default its `b-cdn.net` host) with the
// paths its planned rules claim; every host but `ocx.sh` must answer `noindex`, `ocx.sh` must not. No
// credentials, so no refusal on CI. Zone `index` (the wire zone) has its own probes: what the ocx CLI fetches.
// Every probe is derived from `planRules`, never from a second list.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findLeaks } from '../cutover/leak.mjs';
import { ACTION, TRIGGER, patternRegExp, planRules } from './rules.mjs';
import { PUBLIC_HOST, zoneSpec } from './zones.mjs';

const EXIT = { ok: 0, failed: 1, usage: 2 };
const TIMEOUT_MS = 30_000;
/** Probe path for a trailing `*`: a directory claim is probed one level down, as a real request would be. */
const WILDCARD_TAIL = 'a/b/';

/** Same-host paths that answered 200 on the live site; `task bunny:old-urls` writes it. */
const OLD_URLS = new URL('../old-urls.txt', import.meta.url);

/**
 * A real page a proxy rule serves: a known-good old URL one of its patterns matches, an extensionless page before
 * a file. The pattern itself is no probe path: a directory such as `/docs/` is a 404 on the origin.
 * @param {string} id
 * @param {string[]} patterns path patterns of the rule
 * @returns {string}
 */
function proxyPage(id, patterns) {
  const known = readFileSync(OLD_URLS, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('/') && patterns.some((p) => patternRegExp(`https://h${p}`).test(`https://h${l}`)));
  const page = known.find((l) => !l.endsWith('/') && !/\.[^/]*$/.test(l)) ?? known[0];
  if (page === undefined) throw new Error(`${id}: no known-good path in infra/old-urls.txt matches its patterns`);
  return page;
}

/**
 * @typedef {object} Probe
 * @property {'default' | 'storage' | 'proxy' | 'redirect'} kind
 * @property {string} path
 * @property {number} status expected status
 * @property {string} [location] redirect: the golden `Location`
 * @property {string} [canonical] storage: the golden `<link rel=canonical>`
 */

/**
 * @typedef {object} MainOptions
 * @property {string[]} argv
 * @property {(text: string) => void} out the summary
 * @property {(text: string) => void} err one line per failed probe
 * @property {typeof globalThis.fetch} [fetch] injected in tests
 * @property {string} [baseUrl] replaces `https://<b-cdn.net host>`, injected in tests
 * @property {import('./rules.mjs').PlanInput} [plan] replaces the committed legacy data and claims
 */

/**
 * `%{Path.N-}` resolved the way the edge does: the request path's segments from index N on. Recorded in M0
 * (fixtures/p8-pullzone.json): the edge drops the tail's trailing slash unless the request carries a query string.
 * ponytail: probes carry no query, so the with-query form (`a/b/?q=1` keeps the slash) is not modelled.
 * @param {string} template
 * @param {string} path
 * @returns {string}
 */
function resolveTemplate(template, path) {
  const segments = path.split('/').filter(Boolean);
  return template.replace(/%\{Path\.(\d+)-\}/g, (_, n) => {
    return segments.slice(Number(n)).join('/');
  });
}

/**
 * The probes of a zone: the default origin, one per `OriginStorage` rule (its first claim root), one per proxy rule, and every
 * pattern of a redirect rule.
 * ponytail: one probe per proxy rule (one known-good page); probe every old-urls.txt path of the rule if one hides
 * a dead path.
 * @param {string} zone `dev`, `prod` or `preview:<slug>`
 * @param {import('./rules.mjs').PlanInput} [input]
 * @returns {Probe[]}
 */
export function probesFor(zone, input = {}) {
  const { hosts } = zoneSpec(zone);
  const prefix = `https://${hosts.at(-1)}`;
  /** @type {Probe[]} */
  const probes = [{ kind: 'default', path: '/', status: 200 }];
  for (const rule of planRules(zone, input)) {
    const patterns = rule.Triggers.filter((t) => t.Type === TRIGGER.Url)
      .flatMap((t) => t.PatternMatches)
      .filter((p) => p.startsWith(`${prefix}/`))
      .map((p) => p.slice(prefix.length));
    if (rule.ActionType === ACTION.OriginStorage) {
      // The first root only: a repo's later claims may be a file tree with no index page (`/schemas/` of ocx-sh/ocx).
      for (const path of patterns
        .filter((p) => p.endsWith('/*'))
        .map((p) => p.slice(0, -1))
        .slice(0, 1))
        probes.push({ kind: 'storage', path, status: 200, canonical: `https://${PUBLIC_HOST}${path}` });
    } else if (rule.ActionType === ACTION.OriginUrl && patterns.length > 0) {
      probes.push({ kind: 'proxy', path: proxyPage(rule.Description, patterns), status: 200 });
    } else if (rule.ActionType === ACTION.Redirect) {
      for (const pattern of patterns) {
        const path = pattern.replace(/\*$/, pattern.endsWith('/*') ? WILDCARD_TAIL : '');
        probes.push({
          kind: 'redirect',
          path,
          status: Number(rule.ActionParameter2),
          location: resolveTemplate(rule.ActionParameter1, path),
        });
      }
    }
  }
  return probes;
}

/** @param {string} body @returns {string | undefined} the `href` of `<link rel=canonical>` */
function canonicalOf(body) {
  for (const [tag] of body.matchAll(/<link\b[^>]*>/gi)) {
    if (/\brel\s*=\s*["']?canonical\b/i.test(tag)) return /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  }
  return undefined;
}

/**
 * The reasons one probe fails; empty when it passes.
 * @param {Probe} probe
 * @param {{ status: number, headers: Record<string, string | string[]>, body: string }} res
 * @param {boolean} noindex whether the host must answer `noindex`: every host but `ocx.sh`
 * @returns {string[]}
 */
function failures(probe, { status, headers, body }, noindex) {
  /** @type {string[]} */
  const out = [];
  if (status !== probe.status) out.push(`status ${status}, expected ${probe.status}`);
  if (probe.location !== undefined && headers.location !== probe.location)
    out.push(`Location is ${JSON.stringify(headers.location ?? null)}, expected ${JSON.stringify(probe.location)}`);
  const indexed = !/noindex/i.test([headers['x-robots-tag'] ?? ''].flat().join(','));
  if (noindex && indexed) out.push('X-Robots-Tag has no noindex');
  if (!noindex && !indexed) out.push('X-Robots-Tag has noindex on the public host');
  if (probe.canonical !== undefined) {
    const got = canonicalOf(body);
    if (got !== probe.canonical)
      out.push(`canonical is ${JSON.stringify(got ?? null)}, expected ${JSON.stringify(probe.canonical)}`);
  }
  // A redirect's Location names the legacy origin on purpose, so only a served page is leak-checked.
  if (probe.kind !== 'redirect')
    for (const f of findLeaks({ headers, body })) out.push(`origin leak in ${f.where}: ${f.value}`);
  return out;
}

/**
 * @param {typeof globalThis.fetch} doFetch
 * @param {string} url
 * @param {Record<string, string>} [reqHeaders] request headers
 * @returns {Promise<{ status: number, headers: Record<string, string | string[]>, body: string }>}
 */
async function get(doFetch, url, reqHeaders = {}) {
  const res = await doFetch(url, { headers: reqHeaders, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  /** @type {Record<string, string | string[]>} */
  const headers = Object.fromEntries([...res.headers].filter(([k]) => k !== 'set-cookie'));
  const cookies = res.headers.getSetCookie();
  if (cookies.length > 0) headers['set-cookie'] = cookies;
  return { status: res.status, headers, body: await res.text() };
}

const DEFAULT_PACKAGE = 'sharkdp/bat';

/**
 * The wire zone's probes: what the ocx CLI fetches. `/config.json` must be cacheable (ETag, then 304 on a
 * conditional request) and CORS-open; a package page must carry the sandbox header.
 * @param {typeof globalThis.fetch} doFetch
 * @param {string} base
 * @param {string} pkg `<ns>/<pkg>`
 * @param {(text: string) => void} err
 * @returns {Promise<{ total: number, failed: number }>}
 */
async function wireProbes(doFetch, base, pkg, err) {
  /** @type {{ name: string, run: () => Promise<string[]> }[]} */
  const probes = [
    {
      name: '/config.json',
      run: async () => {
        const url = `${base}/config.json`;
        const res = await get(doFetch, url, { origin: 'https://example.com' });
        const etag = res.headers.etag;
        const bad = [];
        if (res.status !== 200) bad.push(`status ${res.status}, expected 200`);
        if (!/^application\/json\b/i.test(String(res.headers['content-type'] ?? '')))
          bad.push(`Content-Type is ${JSON.stringify(res.headers['content-type'] ?? null)}, expected application/json`);
        if (res.headers['access-control-allow-origin'] !== '*')
          bad.push(
            `Access-Control-Allow-Origin is ${JSON.stringify(res.headers['access-control-allow-origin'] ?? null)}, expected *`,
          );
        if (typeof etag !== 'string' || etag === '') bad.push('no ETag');
        else {
          const cond = await get(doFetch, url, { 'if-none-match': etag });
          if (cond.status !== 304) bad.push(`If-None-Match answered ${cond.status}, expected 304`);
        }
        return bad;
      },
    },
    {
      name: '/c/index.json',
      run: async () => {
        const res = await get(doFetch, `${base}/c/index.json`);
        return res.status === 200 ? [] : [`status ${res.status}, expected 200`];
      },
    },
    {
      name: '/ redirects to the catalog',
      run: async () => {
        const res = await get(doFetch, `${base}/`);
        const bad = [];
        if (res.status !== 301) bad.push(`status ${res.status}, expected 301`);
        if (res.headers.location !== 'https://ocx.sh/catalog/')
          bad.push(`Location is ${JSON.stringify(res.headers.location ?? null)}, expected https://ocx.sh/catalog/`);
        return bad;
      },
    },
    {
      name: `/p/${pkg}.json`,
      run: async () => {
        const res = await get(doFetch, `${base}/p/${pkg}.json`);
        const bad = [];
        if (res.status !== 200) bad.push(`status ${res.status}, expected 200`);
        if (String(res.headers['content-security-policy'] ?? '') !== 'sandbox')
          bad.push(
            `Content-Security-Policy is ${JSON.stringify(res.headers['content-security-policy'] ?? null)}, expected sandbox`,
          );
        return bad;
      },
    },
  ];
  let failed = 0;
  for (const p of probes) {
    let reasons;
    try {
      reasons = await p.run();
    } catch (e) {
      reasons = [`request failed: ${e instanceof Error ? e.message : String(e)}`];
    }
    if (reasons.length > 0) err(`FAIL wire ${p.name}: ${reasons.join('; ')}\n`);
    if (reasons.length > 0) failed++;
  }
  return { total: probes.length, failed };
}

/**
 * Probes a zone. Exit 0 when every probe passes, 1 listing each failed probe (a request that failed counts), 2
 * on bad arguments.
 * @param {MainOptions} options
 * @returns {Promise<number>}
 */
export async function main({ argv, out, err, fetch, baseUrl, plan }) {
  /** @type {string} */
  let zone;
  /** @type {string} */
  let host;
  /** @type {string} */
  let pkg;
  try {
    const { values } = parseArgs({
      args: argv,
      options: { zone: { type: 'string' }, host: { type: 'string' }, package: { type: 'string' } },
    });
    pkg = values.package ?? DEFAULT_PACKAGE;
    if (!/^\w[\w.-]*\/\w[\w.-]*$/.test(pkg)) throw new Error(`--package ${pkg} is not <ns>/<pkg>`);
    zone = values.zone ?? '';
    const { hosts } = zoneSpec(zone);
    host = values.host ?? hosts.at(-1) ?? '';
    if (!hosts.includes(host)) throw new Error(`--host ${host} is not a host of zone ${zone}: ${hosts.join(', ')}`);
  } catch (e) {
    err(
      `${e instanceof Error ? e.message : String(e)}\nusage: verify.mjs --zone <dev|prod|index|preview:<slug>> [--host <zone host>] [--package <ns>/<pkg>]\n`,
    );
    return EXIT.usage;
  }

  try {
    const base = baseUrl ?? `https://${host}`;
    const doFetch = fetch ?? globalThis.fetch;
    if (zone === 'index') {
      const { total, failed } = await wireProbes(doFetch, base, pkg, err);
      out(`${host}: ${total} probes, ${failed} failed\n`);
      return failed === 0 ? EXIT.ok : EXIT.failed;
    }
    const probes = probesFor(zone, plan);
    let failed = 0;
    for (const probe of probes) {
      let reasons;
      try {
        reasons = failures(probe, await get(doFetch, `${base}${probe.path}`), host !== PUBLIC_HOST);
      } catch (e) {
        reasons = [`request failed: ${e instanceof Error ? e.message : String(e)}`];
      }
      if (reasons.length > 0) {
        failed++;
        err(`FAIL ${probe.kind} ${probe.path}: ${reasons.join('; ')}\n`);
      }
    }
    out(`${host}: ${probes.length} probes, ${failed} failed\n`);
    return failed === 0 ? EXIT.ok : EXIT.failed;
  } catch (e) {
    err(`${e instanceof Error ? e.message : String(e)}\n`);
    return EXIT.failed;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    out: (t) => process.stdout.write(t),
    err: (t) => process.stderr.write(t),
  });
}
