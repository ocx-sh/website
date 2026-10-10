// `cutover:verify`: per-host checks of the proxied ocx.sh front, plus the opt-in modes
// `--resolve <ip>`, `--dns` and `--registry` that add checks. No credentials.

import dns from 'node:dns';
import { readFile as fsReadFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { findLeaks } from './leak.mjs';

/**
 * @typedef {object} Reply
 * @property {number} status
 * @property {Record<string, string | string[]>} headers lowercase names; a repeated header is an array
 * @property {string} body
 */

/** @typedef {(url: string, init?: { method?: string, headers?: Record<string, string> }) => Promise<Reply>} Fetch */

/** @typedef {import('node:net').LookupFunction} LookupFunction */

export const HSTS = 'max-age=31536000; includeSubDomains; preload';
// A package the live index serves (`/p/<namespace>/<package>.json`, two name segments).
const INDEX_PACKAGE = 'kitware/cmake';
// `/docs/` itself is a 404 on the VitePress site; this is a real page with the full nav bar.
export const DOCS_PAGE = '/docs/getting-started';

// The registry challenge stays what hetzner1 serves today, whichever host fronts it.
/** JFrog derives realm and service from the request host (`X-JFrog-Override-Base-Url $scheme://$host`). */
export const registryRealm = (/** @type {string} */ host) =>
  `https://${host}/artifactory/api/docker/sh-ocx-oci-prod/v2/token`;
export const REGISTRY_REALM = registryRealm('ocx.sh');
export const REGISTRY_SERVICE = 'ocx.sh';
const MIN_CERT_DAYS = 30;

const EXIT = { ok: 0, failed: 1, usage: 2 };
/** @typedef {(line: string) => void} Line */

/**
 * `fetch` never follows a redirect and replaces `--resolve`'s pin; `pinned` and `cert` are the `--resolve`
 * transport and certificate expiry probe, `resolver` the `--dns` default `node:dns`. `OCX_OLD_URLS` in `env`
 * overrides the old-URL list path.
 * @typedef {{ argv: string[], env: Record<string, string | undefined>, out: Line, err: Line, fetch?: Fetch,
 *   readFile?: (path: string) => Promise<string>, pinned?: (host: string, ip: string) => Fetch,
 *   cert?: (host: string, ip: string) => Promise<Date>, resolver?: Resolver }} Options
 */

const DEFAULT_OLD_URLS = 'infra/old-urls.txt';
const DEFAULT_DNS_BASELINE = 'infra/cutover/dns-baseline.json';
const DAY_MS = 86_400_000;
const TIMEOUT_MS = 15_000;
const WALK_CONCURRENCY = 8;
const MAX_DETAILS = 5;
const REDIRECTS = [301, 302, 308];
// Own hosts a redirect may lead to besides the checked host: a crawl must not be steered to any other.
const OWN_HOST = /(?:^|\.)(?:ocx\.sh|b-cdn\.net)$/i;
// Bunny's edge rules mark the prod zone's rehearsal hostname noindex like a `.b-cdn.net` host.
const REHEARSAL_HOST = 'next.ocx.sh';
const BUNNY_HOST = /(?<![a-z0-9-])(?:[a-z0-9-]+\.)*b-cdn\.net(?![a-z0-9-])/gi;

/**
 * @typedef {object} Wire transport settings of one fetch
 * @property {LookupFunction} [lookup]
 * @property {string} [ca] extra trusted certificates
 * @property {{ http: http.Agent, https: https.Agent }} [agents]
 * @property {string} [portHost] host whose portless URLs use `ports`
 * @property {{ http?: number, https?: number }} [ports]
 */

/**
 * @param {string} url
 * @param {Parameters<Fetch>[1]} init
 * @param {Wire} wire
 * @returns {Promise<Reply>}
 */
function request(url, init = {}, wire = {}) {
  const target = new URL(url);
  const secure = target.protocol === 'https:';
  const transport = secure ? https : http;
  const port = target.hostname === wire.portHost && !target.port ? wire.ports?.[secure ? 'https' : 'http'] : undefined;
  const agent = wire.agents?.[secure ? 'https' : 'http'];
  return new Promise((resolve, reject) => {
    // Options override the URL parts, and an explicit `undefined` would erase the URL's own port.
    const req = transport.request(
      target,
      {
        method: init.method ?? 'GET',
        // A port override would otherwise leak into `Host`.
        headers: { 'user-agent': 'ocx-cutover-verify', ...(port ? { host: target.host } : {}), ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...(wire.lookup ? { lookup: wire.lookup } : {}),
        ...(wire.ca ? { ca: wire.ca } : {}),
        ...(agent ? { agent } : {}),
        ...(port ? { port } : {}),
      },
      (res) => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on('data', (/** @type {Buffer} */ chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          /** @type {Reply['headers']} */
          const headers = {};
          for (const [name, values] of Object.entries(res.headersDistinct)) {
            if (values) headers[name] = values.length === 1 ? (values[0] ?? '') : values;
          }
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString('utf8') });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * One request, no redirect following, a 15 s deadline. The default transport of `main`.
 * @type {Fetch}
 */
export const httpFetch = (url, init) => request(url, init);

/**
 * A `lookup` that answers `host` with `ip` and every other name through the system resolver, so a
 * redirect to `index.ocx.sh` is not sent to the pinned server.
 * @param {string} host
 * @param {string} ip
 * @returns {LookupFunction}
 */
function pinLookup(host, ip) {
  const pinned = host.toLowerCase();
  const family = isIP(ip);
  return (hostname, options, callback) => {
    if (hostname.toLowerCase() !== pinned) return dns.lookup(hostname, options, callback);
    if (options.all) callback(null, [{ address: ip, family }]);
    else callback(null, ip, family);
  };
}

/**
 * `httpFetch` that connects `host` (and only `host`) to `ip`, keeping SNI and `Host` as `host`.
 * `ca` and `ports` are test seams: extra trust, and the ports a loopback fake listens on.
 * @param {{ host: string, ip: string, ca?: string, ports?: { http?: number, https?: number } }} pin
 * @returns {Fetch}
 */
export function pinnedFetch({ host, ip, ca, ports }) {
  const wire = {
    lookup: pinLookup(host, ip),
    portHost: host.toLowerCase(),
    agents: { http: new http.Agent({ keepAlive: true }), https: new https.Agent({ keepAlive: true }) },
    ...(ca ? { ca } : {}),
    ...(ports ? { ports } : {}),
  };
  return (url, init) => request(url, init, wire);
}

/**
 * Expiry of the certificate `ip` serves for SNI `host`; rejects when it does not verify for `host`.
 * @param {{ host: string, ip: string, port?: number, ca?: string }} probe
 * @returns {Promise<Date>}
 */
export function peerCertExpiry({ host, ip, port = 443, ca }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: ip, port, servername: host, ...(ca ? { ca } : {}) });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('certificate probe timed out')));
    socket.once('error', reject);
    socket.once('secureConnect', () => {
      const validTo = socket.getPeerCertificate().valid_to;
      socket.end();
      resolve(new Date(validTo));
    });
  });
}

/** @param {string} host */
const isBunnyHost = (host) => host.endsWith('.b-cdn.net');

/**
 * Paths of the old-URL list: one per line, `#` comments and blanks skipped; an absolute URL keeps
 * its path and query.
 * @param {string} text
 * @returns {string[]}
 */
export function parseOldUrls(text) {
  return text.split('\n').flatMap((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return [];
    if (/^https?:\/\//i.test(line)) {
      const url = new URL(line);
      return [url.pathname + url.search];
    }
    if (!line.startsWith('/')) throw new Error(`line ${i + 1} is neither a path nor an absolute URL: ${line}`);
    return [line];
  });
}

/** @typedef {{ url: string, status: number, headers: Reply['headers'] }} Seen one response of the old-URL walk, headers only */

/**
 * Everything one run shares: the host, the transport and a per-path page cache.
 * @param {{ host: string, fetch: Fetch, readFile: (path: string) => Promise<string>, oldUrlsPath: string,
 *   certExpiry?: () => Promise<Date>, resolver?: Resolver, baselinePath?: string }} deps
 */
export function createContext({ host, fetch, readFile, oldUrlsPath, certExpiry, resolver, baselinePath }) {
  const base = `https://${host}`;
  /** @type {Map<string, Promise<Reply>>} */
  const pages = new Map();
  /** @type {Promise<{ problems: string[], seen: Seen[] }> | undefined} */
  let walked;

  const get = (/** @type {string} */ path) => {
    let page = pages.get(path);
    if (!page) pages.set(path, (page = fetch(base + path)));
    return page;
  };

  /** Fetches every old URL once and keeps only headers, so 2,000 pages do not sit in memory. */
  const walk = () =>
    (walked ??= (async () => {
      /** @type {string[]} */
      let paths;
      try {
        paths = parseOldUrls(await readFile(oldUrlsPath));
      } catch (cause) {
        return { problems: [`cannot read ${oldUrlsPath}: ${describe(cause)}`], seen: [] };
      }
      /** @type {string[][]} */
      const problems = paths.map(() => []);
      /** @type {Seen[][]} */
      const seen = paths.map(() => []);
      let next = 0;
      const worker = async () => {
        for (let i = next++; i < paths.length; i = next++) {
          const path = paths[i] ?? '';
          try {
            await walkOne(fetch, base + path, problems[i] ?? [], seen[i] ?? []);
          } catch (cause) {
            problems[i]?.push(`${path}: ${describe(cause)}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(WALK_CONCURRENCY, paths.length) }, worker));
      return { problems: problems.flat(), seen: seen.flat() };
    })());

  const missing = (/** @type {string} */ what) => () => Promise.reject(new Error(`no ${what} configured`));
  return {
    host,
    base,
    fetch,
    get,
    walk,
    readFile,
    certExpiry: certExpiry ?? missing('certificate probe'),
    resolver: resolver ?? new dns.promises.Resolver(),
    baselinePath: baselinePath ?? DEFAULT_DNS_BASELINE,
  };
}

/** @typedef {ReturnType<typeof createContext>} Context */

/**
 * 200, or exactly one 301/302/308 to a 200.
 * @param {Fetch} fetch
 * @param {string} url
 * @param {string[]} problems
 * @param {Seen[]} seen
 */
async function walkOne(fetch, url, problems, seen) {
  const label = new URL(url).pathname;
  const first = await fetch(url);
  seen.push({ url, status: first.status, headers: first.headers });
  if (first.status === 200) return;
  if (!REDIRECTS.includes(first.status)) return void problems.push(`${label}: status ${first.status}`);

  const target = locate(first, url);
  if (!target) return void problems.push(`${label}: redirect without Location`);
  if (target === url) return void problems.push(`${label}: redirect loop to itself`);

  const { host, hostname } = new URL(target);
  if (hostname !== new URL(url).hostname && !OWN_HOST.test(hostname)) {
    return void problems.push(`${label}: redirect leaves the site for ${host}, not followed`);
  }
  const second = await fetch(target);
  seen.push({ url: target, status: second.status, headers: second.headers });
  if (second.status === 200) return;
  if (!REDIRECTS.includes(second.status))
    return void problems.push(`${label}: redirect target answers ${second.status}`);
  const onward = locate(second, target);
  problems.push(`${label}: ${onward === url ? 'redirect loop' : 'redirect chain'} via ${target}`);
}

/**
 * @param {Reply} reply
 * @param {string} from
 * @returns {string | undefined}
 */
function locate(reply, from) {
  const location = values(reply.headers, 'location')[0];
  return location ? new URL(location, from).href : undefined;
}

/**
 * @param {Reply['headers']} headers
 * @param {string} name
 * @returns {string[]}
 */
function values(headers, name) {
  return Object.entries(headers).flatMap(([key, raw]) => (key.toLowerCase() === name ? [raw].flat() : []));
}

/** @param {unknown} cause */
const describe = (cause) => (cause instanceof Error ? cause.message : String(cause));

/**
 * @param {string} tag
 * @param {string} name
 */
function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match?.[1] ?? match?.[2];
}

/**
 * Every `b-cdn.net` host in `Location`, `Link`, canonical or `og:url`.
 * @param {Reply['headers']} headers
 * @param {string} body
 * @returns {string[]}
 */
function bunnyHosts(headers, body) {
  /** @type {string[]} */
  const found = [];
  const scan = (/** @type {string} */ where, /** @type {string | undefined} */ text) => {
    for (const host of text?.match(BUNNY_HOST) ?? []) found.push(`${where} ${host}`);
  };
  for (const name of ['location', 'link']) for (const value of values(headers, name)) scan(name, value);
  for (const [tag] of body.matchAll(/<(?:link|meta)\b[^>]*>/gi)) {
    if (/^canonical$/i.test(attr(tag, 'rel') ?? '')) scan('canonical', attr(tag, 'href'));
    if (/^og:url$/i.test(attr(tag, 'property') ?? '')) scan('og:url', attr(tag, 'content'));
  }
  return found;
}

/**
 * @param {Reply} reply
 * @param {string} label
 * @param {number} [status]
 * @returns {string[]}
 */
function expectStatus(reply, label, status = 200) {
  return reply.status === status ? [] : [`${label}: status ${reply.status}, want ${status}`];
}

/** Each check returns its problems; none is green. @param {Context} ctx @returns {Promise<string[]>} */
async function checkOldUrls(ctx) {
  return (await ctx.walk()).problems;
}

/**
 * No origin host in the home page, a real docs page or any old-URL response. A redirect response is
 * skipped: the walk flags one that leaves the site.
 */
async function checkOriginLeak(/** @type {Context} */ ctx) {
  const { seen } = await ctx.walk();
  /** @type {{ label: string, status: number, headers: Reply['headers'], body: string }[]} */
  const responses = [];
  for (const path of ['/', DOCS_PAGE]) responses.push({ label: path, ...(await ctx.get(path)) });
  for (const { url, status, headers } of seen)
    responses.push({ label: new URL(url).pathname, status, headers, body: '' });
  return responses
    .filter(({ status }) => !REDIRECTS.includes(status))
    .flatMap(({ label, headers, body }) => findLeaks({ headers, body }).map((f) => `${label}: ${f.where} ${f.value}`));
}

/**
 * A proxied docs page's Home nav link (`a.VPNavBarMenuLink`) and logo link (`a.title`) to `/` carry
 * `target="_self"`, which the ocx VitePress config sets with `target: '_self'` and `logoLink`.
 */
export async function checkHomeLink(/** @type {Context} */ ctx) {
  const page = await ctx.get(DOCS_PAGE);
  const problems = expectStatus(page, DOCS_PAGE);
  /** @type {Record<string, number>} */
  const found = { 'Home nav link': 0, 'logo link': 0 };
  for (const [tag] of page.body.matchAll(/<a\b[^>]*>/gi)) {
    const href = (attr(tag, 'href') ?? '').replace(ctx.base, '');
    const classes = (attr(tag, 'class') ?? '').split(/\s+/);
    const kind = classes.includes('VPNavBarMenuLink') ? 'Home nav link' : classes.includes('title') ? 'logo link' : '';
    if (href !== '/' || !kind) continue;
    found[kind] = (found[kind] ?? 0) + 1;
    if (attr(tag, 'target') !== '_self') problems.push(`${kind} lacks target="_self"`);
  }
  for (const [kind, count] of Object.entries(found)) if (!count) problems.push(`no ${kind} to /`);
  return problems;
}

/** `X-Robots-Tag: noindex` on `.b-cdn.net` hosts and the rehearsal host, absent everywhere else. */
async function checkNoindex(/** @type {Context} */ ctx) {
  const tags = values((await ctx.get('/')).headers, 'x-robots-tag');
  const present = tags.some((tag) => /noindex/i.test(tag));
  const want = isBunnyHost(ctx.host) || ctx.host === REHEARSAL_HOST;
  return present === want
    ? []
    : [`X-Robots-Tag noindex is ${present ? 'present' : 'absent'}, want ${want ? 'present' : 'absent'}`];
}

/** HSTS equals `HSTS` and, with `X-Frame-Options`, appears exactly once (nginx and Bunny both set them). */
async function checkSecurityHeaders(/** @type {Context} */ ctx) {
  const { headers } = await ctx.get('/');
  const each = (/** @type {string} */ name) => values(headers, name).flatMap((v) => v.split(',').map((p) => p.trim()));
  const hsts = each('strict-transport-security');
  const xfo = each('x-frame-options');
  /** @type {string[]} */
  const problems = [];
  if (hsts.length !== 1) problems.push(`Strict-Transport-Security appears ${hsts.length} times, want 1`);
  else if (hsts[0] !== HSTS) problems.push(`Strict-Transport-Security is "${hsts[0]}", want "${HSTS}"`);
  if (xfo.length !== 1) problems.push(`X-Frame-Options appears ${xfo.length} times, want 1`);
  return problems;
}

/** No `b-cdn.net` host in a `Location`, `Link`, canonical or `og:url` served for `<h>`, on the home and a docs page. */
async function checkNoBunnyHost(/** @type {Context} */ ctx) {
  const { seen } = await ctx.walk();
  /** @type {string[]} */
  const problems = [];
  for (const path of ['/', DOCS_PAGE]) {
    const { headers, body } = await ctx.get(path);
    problems.push(...bunnyHosts(headers, body).map((f) => `${path}: ${f}`));
  }
  for (const { url, headers } of seen) {
    problems.push(...bunnyHosts(headers, '').map((f) => `${new URL(url).pathname}: ${f}`));
  }
  return problems;
}

/** `http://<h>/` answers one 301 to `https://<h>/`. */
async function checkHttpRedirect(/** @type {Context} */ ctx) {
  const reply = await ctx.fetch(`http://${ctx.host}/`);
  const want = `https://${ctx.host}/`;
  const location = values(reply.headers, 'location')[0];
  return [
    ...expectStatus(reply, 'http root', 301),
    ...(location === want ? [] : [`Location is "${location}", want "${want}"`]),
  ];
}

/**
 * `/pagefind/pagefind.js` revalidates and is JavaScript. Bunny's browser override of 0 sends
 * `public, max-age=0` (stale at once, so the browser revalidates); `no-cache` passes too.
 */
async function checkPagefind(/** @type {Context} */ ctx) {
  const reply = await ctx.get('/pagefind/pagefind.js');
  const cache = values(reply.headers, 'cache-control').join(', ');
  const type = values(reply.headers, 'content-type').join(', ');
  return [
    ...expectStatus(reply, '/pagefind/pagefind.js'),
    ...(/no-cache|max-age=0(?!\d)/i.test(cache) ? [] : [`cache-control is "${cache}", want no-cache or max-age=0`]),
    ...(/javascript/i.test(type) ? [] : [`content-type is "${type}", want JavaScript`]),
  ];
}

/** One `/_astro/` asset referenced by the home page is immutable (`max-age=31536000`). */
async function checkAstroAsset(/** @type {Context} */ ctx) {
  const asset = (await ctx.get('/')).body.match(/(?:src|href)\s*=\s*["'](\/_astro\/[^"']+)["']/i)?.[1];
  if (!asset) return ['no /_astro/ asset referenced from /'];
  const reply = await ctx.get(asset);
  const cache = values(reply.headers, 'cache-control').join(', ');
  return [
    ...expectStatus(reply, asset),
    ...(/max-age=31536000(?!\d)/.test(cache) ? [] : [`${asset} cache-control is "${cache}", want max-age=31536000`]),
  ];
}

/**
 * `/robots.txt` has no `Disallow: /`; the PATH of its `Sitemap:` URL answers 200 on `<h>`
 * (the literal URL is the old site until the ocx.sh switch).
 */
export async function checkRobots(/** @type {Context} */ ctx) {
  const reply = await ctx.get('/robots.txt');
  const problems = expectStatus(reply, '/robots.txt');
  const text = reply.body.replace(/#.*$/gm, '');
  if (/^\s*disallow\s*:\s*\/\s*$/im.test(text)) problems.push('robots.txt has Disallow: /');
  const sitemaps = [...text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1] ?? '');
  if (!sitemaps.length) problems.push('robots.txt has no Sitemap line');
  for (const sitemap of sitemaps) {
    const { pathname, search } = new URL(sitemap);
    problems.push(...expectStatus(await ctx.get(pathname + search), `sitemap ${pathname}`));
  }
  return problems;
}

/** The ocx CLI index (`index.ocx.sh`) answers 200 JSON with no redirect. */
async function checkIndexJson(/** @type {Context} */ ctx) {
  /** @type {string[]} */
  const problems = [];
  for (const path of ['/config.json', `/p/${INDEX_PACKAGE}.json`]) {
    const reply = await ctx.fetch(`https://index.ocx.sh${path}`);
    const type = values(reply.headers, 'content-type').join(', ');
    problems.push(...expectStatus(reply, `index.ocx.sh${path}`));
    if (reply.status === 200 && !/^application\/json\b/i.test(type))
      problems.push(`index.ocx.sh${path} content-type is "${type}"`);
  }
  return problems;
}

/** `--resolve`: the certificate served for `<h>` stays valid for more than 30 days. */
export async function checkCertificate(/** @type {Context} */ ctx) {
  const days = ((await ctx.certExpiry()).getTime() - Date.now()) / DAY_MS;
  if (Number.isNaN(days)) return ['certificate expiry is unreadable'];
  return days > MIN_CERT_DAYS
    ? []
    : [`certificate for ${ctx.host} expires in ${Math.max(0, Math.floor(days))} days, want more than ${MIN_CERT_DAYS}`];
}

/** @param {string[]} records */
const canonical = (records) => records.map((r) => r.trim().toLowerCase().replace(/\.$/, '')).sort();

/**
 * @param {() => Promise<string[]>} lookup
 * @returns {Promise<string[]>} no record of the type counts as an empty list
 */
async function records(lookup) {
  try {
    return await lookup();
  } catch (cause) {
    if (/** @type {NodeJS.ErrnoException} */ (cause).code === 'ENODATA') return [];
    throw cause;
  }
}

/**
 * @typedef {object} Resolver the `node:dns` `Resolver` methods the `--dns` check uses
 * @property {(host: string) => Promise<{ priority: number, exchange: string }[]>} resolveMx
 * @property {(host: string) => Promise<string[][]>} resolveTxt
 */

/** `--dns`: the baseline host's `MX` and `TXT` records are exactly those of the baseline file. */
async function checkDns(/** @type {Context} */ ctx) {
  /** @type {unknown} */
  let baseline;
  try {
    baseline = JSON.parse(await ctx.readFile(ctx.baselinePath));
  } catch (cause) {
    return [`cannot read ${ctx.baselinePath}: ${describe(cause)}`];
  }
  const { host, MX, TXT } =
    typeof baseline === 'object' && baseline !== null ? /** @type {Record<string, unknown>} */ (baseline) : {};
  const strings = (/** @type {unknown} */ v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (typeof host !== 'string' || !strings(MX) || !strings(TXT)) return [`${ctx.baselinePath} needs host, MX and TXT`];

  const live = {
    MX: canonical(
      await records(async () => (await ctx.resolver.resolveMx(host)).map((r) => `${r.priority} ${r.exchange}`)),
    ),
    // A TXT value split into 255-byte chunks is one value.
    TXT: canonical(await records(async () => (await ctx.resolver.resolveTxt(host)).map((chunks) => chunks.join('')))),
  };
  const want = { MX: canonical(/** @type {string[]} */ (MX)), TXT: canonical(/** @type {string[]} */ (TXT)) };
  return /** @type {const} */ (['MX', 'TXT']).flatMap((type) => [
    ...want[type].filter((r) => !live[type].includes(r)).map((r) => `${host} ${type} lost "${r}"`),
    ...live[type].filter((r) => !want[type].includes(r)).map((r) => `${host} ${type} gained "${r}"`),
  ]);
}

/**
 * @param {string} challenge a `WWW-Authenticate` value
 * @param {string} name
 */
const challengeParam = (challenge, name) => challenge.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1];

/**
 * `--registry`: `/v2/` still answers the JFrog challenge, 401 with the unchanged realm and service. Both name
 * the probed host, so the `edge.ocx.sh` rehearsal expects its own name and `ocx.sh` expects `ocx.sh`.
 */
async function checkRegistryChallenge(/** @type {Context} */ ctx) {
  const reply = await ctx.get('/v2/');
  const challenge = values(reply.headers, 'www-authenticate').join(', ');
  const realm = challengeParam(challenge, 'realm');
  const service = challengeParam(challenge, 'service');
  const wantRealm = registryRealm(ctx.host);
  return [
    ...expectStatus(reply, '/v2/', 401),
    ...(/^\s*bearer\b/i.test(challenge) ? [] : [`/v2/ challenge is "${challenge}", want Bearer`]),
    ...(realm === wantRealm ? [] : [`realm is "${realm}", want "${wantRealm}"`]),
    ...(service === ctx.host ? [] : [`service is "${service}", want "${ctx.host}"`]),
  ];
}

/** `--registry`: the token endpoint of the realm answers 200 on `<h>`. */
async function checkRegistryToken(/** @type {Context} */ ctx) {
  const path = `${new URL(REGISTRY_REALM).pathname}?service=${REGISTRY_SERVICE}`;
  return expectStatus(await ctx.get(path), 'token endpoint');
}

/** `--registry`: `/docs/v2/` is a docs path, not the registry's 401 challenge. */
async function checkDocsV2(/** @type {Context} */ ctx) {
  const reply = await ctx.get('/docs/v2/');
  const challenge = values(reply.headers, 'www-authenticate').length > 0;
  return reply.status === 401 || challenge ? [`/docs/v2/ answers the registry challenge (status ${reply.status})`] : [];
}

/**
 * The named checks that apply to `host`, then those of each requested mode.
 * @param {string} host
 * @param {{ resolve?: boolean, dns?: boolean, registry?: boolean }} [modes]
 * @returns {[string, (ctx: Context) => Promise<string[]>][]}
 */
function checksFor(host, modes = {}) {
  /** @type {[string, (ctx: Context) => Promise<string[]>][]} */
  const extra = [];
  if (modes.resolve) extra.push(['certificate', checkCertificate]);
  if (modes.dns) extra.push(['dns', checkDns]);
  if (modes.registry) {
    extra.push(
      ['registry-challenge', checkRegistryChallenge],
      ['registry-token', checkRegistryToken],
      ['docs-v2', checkDocsV2],
    );
  }
  return [
    ['old-urls', checkOldUrls],
    ['origin-leak', checkOriginLeak],
    ['home-link', checkHomeLink],
    ['noindex', checkNoindex],
    ...(isBunnyHost(host)
      ? []
      : /** @type {[string, (ctx: Context) => Promise<string[]>][]} */ ([
          ['security-headers', checkSecurityHeaders],
          ['no-bunny-host', checkNoBunnyHost],
        ])),
    ...(host === 'ocx.sh'
      ? /** @type {[string, (ctx: Context) => Promise<string[]>][]} */ ([
          ['http-redirect', checkHttpRedirect],
          ['pagefind', checkPagefind],
          ['astro-asset', checkAstroAsset],
          ['robots', checkRobots],
        ])
      : []),
    ['index-json', checkIndexJson],
    ...extra,
  ];
}

/**
 * Runs every check for `--host` and for each mode flag, one `ok`/`FAIL` line each.
 * @param {Options} options
 * @returns {Promise<number>} an `EXIT` code: ok, a check failed, usage
 */
export async function main({
  argv,
  env,
  out,
  err,
  fetch,
  readFile = (p) => fsReadFile(p, 'utf8'),
  pinned = (host, ip) => pinnedFetch({ host, ip }),
  cert = (host, ip) => peerCertExpiry({ host, ip }),
  resolver,
}) {
  const usage = 'usage: verify --host <h> [--resolve <ip>] [--dns] [--registry]';
  /** @type {ReturnType<typeof parseArgs>} */
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        host: { type: 'string' },
        resolve: { type: 'string' },
        dns: { type: 'boolean' },
        registry: { type: 'boolean' },
      },
      allowPositionals: false,
    });
  } catch (cause) {
    err(`${describe(cause)}\n${usage}`);
    return EXIT.usage;
  }
  const { host, resolve, dns: wantDns, registry } = parsed.values;
  if (typeof host !== 'string' || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host)) {
    err(usage);
    return EXIT.usage;
  }
  if (resolve !== undefined && (typeof resolve !== 'string' || !isIP(resolve))) {
    err(`--resolve needs an IP address\n${usage}`);
    return EXIT.usage;
  }
  const ip = resolve;

  const ctx = createContext({
    host,
    fetch: fetch ?? (ip ? pinned(host, ip) : httpFetch),
    readFile,
    oldUrlsPath: env.OCX_OLD_URLS ?? DEFAULT_OLD_URLS,
    ...(ip ? { certExpiry: () => cert(host, ip) } : {}),
    ...(resolver ? { resolver } : {}),
  });
  let failed = false;
  for (const [name, check] of checksFor(host, {
    resolve: ip !== undefined,
    dns: wantDns === true,
    registry: registry === true,
  })) {
    /** @type {string[]} */
    let problems;
    try {
      problems = await check(ctx);
    } catch (cause) {
      problems = [describe(cause)];
    }
    if (!problems.length) {
      out(`ok   ${name}`);
      continue;
    }
    failed = true;
    const more = problems.length > MAX_DETAILS ? ` (+${problems.length - MAX_DETAILS} more)` : '';
    out(`FAIL ${name}: ${problems.slice(0, MAX_DETAILS).join('; ')}${more}`);
  }
  return failed ? EXIT.failed : EXIT.ok;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}
