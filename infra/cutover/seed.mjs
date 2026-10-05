// `bunny:old-urls`: crawls the live site and writes the old-URL list `cutover:verify` replays.
// Read-only (GET only), no credentials.

import { readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * @typedef {object} Reply
 * @property {number} status
 * @property {string | undefined} location
 * @property {string} html the body of an HTML reply, else empty
 */

/** @typedef {(url: string) => Promise<Reply>} Get one request, never follows a redirect */

const DEFAULT_ORIGIN = 'https://ocx.sh/';
const DEFAULT_OUT = 'infra/old-urls.txt';
const CAP = 2000;
const EXIT = { ok: 0, failed: 1, usage: 2 };
// A rewrite that loses more than this share of the committed list is an outage, not a site change.
const MIN_SURVIVING = 0.9;
// A redirect is followed only to the origin or ocx.sh and its subdomains and Bunny hosts, never an arbitrary host.
const OWN_HOST = /(?:^|\.)(?:ocx\.sh|b-cdn\.net)$/i;
const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;
const REDIRECTS = [301, 302, 308];
// nginx serves the registry on `/v2` and `/artifactory`, and Cloudflare injects `/cdn-cgi` assets
// (hashed, gone with Cloudflare); none is part of the website.
const SKIPPED = ['/v2', '/artifactory', '/cdn-cgi'];
const START = ['/', '/docs/'];
const HEADER =
  '# Same-host URLs that answered 200, or one redirect to a 200, when `task bunny:old-urls` last crawled the live site.';

/** @type {Get} */
export async function liveGet(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  const isHtml = /^text\/html\b/i.test(res.headers.get('content-type') ?? '');
  const html = isHtml ? await res.text() : '';
  if (!isHtml) await res.body?.cancel();
  return { status: res.status, location: res.headers.get('location') ?? undefined, html };
}

/**
 * Same-host `href` and `src` targets of a page as `path?query` strings, fragments dropped, the
 * registry prefixes skipped.
 * @param {string} html
 * @param {string} from absolute URL of the page
 * @param {string} host the origin's `host`
 * @returns {string[]}
 */
export function links(html, from, host) {
  /** @type {Set<string>} */
  const found = new Set();
  for (const [, dq, sq, bare] of html.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    let url;
    try {
      url = new URL((dq ?? sq ?? bare ?? '').replaceAll('&amp;', '&'), from);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || url.host !== host) continue;
    if (SKIPPED.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) continue;
    found.add(url.pathname + url.search);
  }
  return [...found];
}

/**
 * Breadth-first, one level at a time with each level sorted, so a crawl that hits the cap keeps the
 * same URLs on every run. A URL is healthy when it answers 200 or exactly one redirect to a 200.
 * @param {{ origin: string, get: Get, cap?: number, concurrency?: number }} options
 * @returns {Promise<{ urls: string[], dropped: number }>}
 */
export async function crawl({ origin, get, cap = CAP, concurrency = CONCURRENCY }) {
  const base = new URL(origin);
  const queued = new Set(START.slice(0, cap));
  /** @type {string[]} */
  let level = [...queued].sort();
  /** @type {string[]} */
  const healthy = [];

  while (level.length) {
    /** @type {Set<string>} */
    const next = new Set();
    let i = 0;
    const worker = async () => {
      for (let n = i++; n < level.length; n = i++) {
        const path = level[n] ?? '';
        const reply = await check(get, new URL(path, base).href);
        if (!reply) continue;
        healthy.push(path);
        for (const link of links(reply.html, new URL(path, base).href, base.host)) next.add(link);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, level.length) }, worker));
    level = [];
    for (const path of [...next].sort()) {
      if (queued.size >= cap) break;
      if (!queued.has(path)) {
        queued.add(path);
        level.push(path);
      }
    }
  }
  return { urls: healthy.sort(), dropped: queued.size - healthy.length };
}

/**
 * The reply to parse for links when `url` is healthy, else undefined. A redirect's first hop is the
 * reply; its target is not crawled.
 * @param {Get} get
 * @param {string} url
 * @returns {Promise<Reply | undefined>}
 */
async function check(get, url) {
  try {
    const first = await get(url);
    if (first.status === 200) return first;
    if (!REDIRECTS.includes(first.status) || !first.location) return undefined;
    const target = new URL(first.location, url);
    if (target.hostname !== new URL(url).hostname && !OWN_HOST.test(target.hostname)) return undefined;
    return (await get(target.href)).status === 200 ? { ...first, html: '' } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {{ argv: string[], env?: Record<string, string | undefined>, out: (line: string) => void,
 *   err: (line: string) => void, get?: Get, writeFile?: (path: string, text: string) => Promise<void>,
 *   readFile?: (path: string) => Promise<string> }} options
 * @returns {Promise<number>} 0 written, 1 refused (nothing healthy, or the list shrank), 2 usage
 */
export async function main({
  argv,
  env = {},
  out,
  err,
  get = liveGet,
  writeFile = (p, t) => fsWriteFile(p, t),
  readFile = (p) => fsReadFile(p, 'utf8'),
}) {
  /** @type {ReturnType<typeof parseArgs>} */
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { origin: { type: 'string' }, out: { type: 'string' } },
      allowPositionals: false,
    });
  } catch (cause) {
    err(`${cause instanceof Error ? cause.message : String(cause)}\nusage: old-urls [--origin <url>] [--out <file>]`);
    return EXIT.usage;
  }
  const origin = typeof parsed.values.origin === 'string' ? parsed.values.origin : DEFAULT_ORIGIN;
  const file = typeof parsed.values.out === 'string' ? parsed.values.out : (env['OCX_OLD_URLS'] ?? DEFAULT_OUT);
  const { urls, dropped } = await crawl({ origin, get });
  if (!urls.length) {
    err(`nothing healthy at ${origin}; ${file} left untouched`);
    return EXIT.failed;
  }
  const previous = await readList(readFile, file);
  const kept = previous.filter((url) => urls.includes(url)).length;
  // `check()` reads every error as unhealthy, so a partial outage would otherwise shrink the committed list.
  if (kept < previous.length * MIN_SURVIVING) {
    err(
      `refusing to write ${file}: ${previous.length - kept} of ${previous.length} listed URLs are no longer healthy; delete the file to accept the smaller list`,
    );
    return EXIT.failed;
  }
  await writeFile(file, `${HEADER}\n${urls.join('\n')}\n`);
  out(`${urls.length} URLs written to ${file}, ${dropped} dropped as unhealthy`);
  return EXIT.ok;
}

/**
 * The URLs of the committed list; none when the file is absent.
 * @param {(path: string) => Promise<string>} readFile
 * @param {string} file
 * @returns {Promise<string[]>}
 */
async function readList(readFile, file) {
  try {
    return (await readFile(file)).split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  } catch {
    return [];
  }
}
