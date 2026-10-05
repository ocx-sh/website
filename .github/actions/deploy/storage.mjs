// The only Bunny storage client: the deploy action and `infra/bunny/gc.mjs` import it.
import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @typedef {object} StorageClient
 * @property {string} host storage endpoint host, e.g. `storage.bunnycdn.com`
 * @property {string} zone storage zone name
 * @property {string} accessKey zone password; every thrown error replaces it with `***`
 * @property {(url: string, init?: RequestInit) => Promise<Response>} [fetch] injected in tests
 * @property {number} [timeoutMs] per-request timeout
 */

/**
 * One entry as the Bunny list endpoint returns it.
 * @typedef {object} StorageEntry
 * @property {string} Path `/<zone>/<dir>/`, always ending in `/`
 * @property {string} ObjectName file or directory name, without a trailing slash
 * @property {boolean} IsDirectory
 */

/**
 * @typedef {object} ListLimits
 * @property {number} [maxDepth] deepest directory nesting, the listed root being 0
 * @property {number} [maxEntries] most entries (files, for `walkDist`) before the walk throws
 * @property {boolean} [emptyIfMissing] a 404 on the listed root is an empty listing; a 404 on any
 *   directory below it is still an error
 */

/**
 * @typedef {object} DistFile
 * @property {string} path POSIX path relative to the dist root
 * @property {string} absolute path on disk
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const LIST_CONCURRENCY = 5;
const DEFAULT_LIMITS = { maxDepth: 32, maxEntries: 100_000 };
/** Longest slice of a response body quoted in an error. */
const BODY_QUOTE = 200;

/** A failed storage request. `status` is the HTTP status, or 0 when no response arrived. */
export class StorageError extends Error {
  /**
   * @param {string} message already redacted
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.name = 'StorageError';
    this.status = status;
  }
}

/**
 * Replace every occurrence of the key, raw and URL-encoded, with `***`. Split/join, not a regex:
 * the key is arbitrary text.
 * @param {StorageClient} client
 * @param {string} text
 * @returns {string}
 */
function redact(client, text) {
  let out = text;
  for (const form of new Set([client.accessKey, encodeURIComponent(client.accessKey)])) {
    if (form) out = out.split(form).join('***');
  }
  return out;
}

/**
 * Check one zone-relative path. Rejects `..` anywhere, `.` segments, empty segments, backslashes and
 * a leading or trailing `/`, so no path can leave its directory or name a directory.
 * @param {string} path
 * @param {string} what for the error message
 * @returns {string[]} the segments
 */
function segmentsOf(path, what) {
  if (path.includes('..')) throw new Error(`${what} contains "..": ${JSON.stringify(path)}`);
  if (path === '') throw new Error(`${what} is empty`);
  if (path.includes('\\')) throw new Error(`${what} contains a backslash: ${JSON.stringify(path)}`);
  const parts = path.split('/');
  if (parts.some((p) => p === '' || p === '.')) {
    throw new Error(`${what} has an empty or "." segment or a leading or trailing "/": ${JSON.stringify(path)}`);
  }
  return parts;
}

/**
 * The request URL for a zone-relative path. A `dir` URL ends in `/`, a file URL never does.
 * @param {StorageClient} client
 * @param {string} rel `''` is the zone root, valid only for a directory
 * @param {boolean} dir
 * @returns {string}
 */
function urlFor(client, rel, dir) {
  const parts = rel === '' && dir ? [] : segmentsOf(rel, 'path');
  const tail = parts.map(encodeURIComponent).join('/');
  const url = `https://${client.host}/${encodeURIComponent(client.zone)}/${tail}${dir && tail ? '/' : ''}`;
  // A host like `evil.test@good.test` or `evil.test/x` would carry the AccessKey somewhere else.
  if (!client.host || new URL(url).host !== client.host)
    throw new Error(`invalid storage host: ${JSON.stringify(client.host)}`);
  return url;
}

/**
 * One request with a deadline and no redirects (a redirect would forward the AccessKey). Every
 * failure is a `StorageError` whose text has the key replaced; the original error is not attached as
 * `cause` because it can carry the key.
 * @param {StorageClient} client
 * @param {string} method
 * @param {string} url
 * @param {Record<string, string>} [headers]
 * @param {Uint8Array | string} [body]
 * @returns {Promise<string>} the response body text
 */
async function request(client, method, url, headers = {}, body) {
  const doFetch = client.fetch ?? globalThis.fetch;
  let res;
  let text;
  try {
    res = await doFetch(url, {
      method,
      headers: { ...headers, AccessKey: client.accessKey },
      ...(body === undefined ? {} : { body: /** @type {BodyInit} */ (body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(client.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new StorageError(redact(client, `${method} ${url} failed: ${reason}`).slice(0, 500), 0);
  }
  if (!res.ok) {
    // Redact before cutting: cutting first could leave a key prefix that no longer matches.
    const quoted = redact(client, text).slice(0, BODY_QUOTE);
    throw new StorageError(`${method} ${redact(client, url)} failed: ${res.status} ${quoted}`.trim(), res.status);
  }
  return text;
}

/**
 * Validate a listed entry and return its zone-relative path. Rejects a foreign zone, a `Path` not
 * ending in `/`, and an `ObjectName` that is empty, nested or contains `..`.
 * @param {StorageClient} client
 * @param {StorageEntry} entry
 * @returns {string}
 */
function relOf(client, entry) {
  const { Path, ObjectName } = entry;
  const root = `/${client.zone}/`;
  if (typeof Path !== 'string' || typeof ObjectName !== 'string' || typeof entry.IsDirectory !== 'boolean') {
    throw new Error('malformed storage entry');
  }
  if (!Path.startsWith(root) || !Path.endsWith('/'))
    throw new Error(`entry path outside zone ${client.zone}: ${JSON.stringify(Path)}`);
  const dir = Path.slice(root.length);
  if (ObjectName.includes('/')) throw new Error(`entry name contains "/": ${JSON.stringify(ObjectName)}`);
  const rel = `${dir}${ObjectName}`;
  segmentsOf(rel, 'entry path');
  return rel;
}

/**
 * Run `fn` over `items`, at most `limit` at a time; after a failure no new item starts.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} fn
 * @returns {Promise<void>}
 */
async function eachLimited(items, limit, fn) {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = /** @type {T} */ (items[next++]);
      try {
        await fn(item);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * List every entry under `dir` recursively, at most 5 listings in flight.
 * @param {StorageClient} client
 * @param {string} [dir] zone-relative directory, default the root
 * @param {ListLimits} [limits]
 * @returns {Promise<StorageEntry[]>}
 */
export async function listRecursive(client, dir = '', limits = {}) {
  const { maxDepth, maxEntries, emptyIfMissing } = { ...DEFAULT_LIMITS, ...limits };
  const start = dir.replace(/^\/+|\/+$/g, '');
  if (start) segmentsOf(start, 'directory');
  /** @type {StorageEntry[]} */
  const all = [];
  let level = [start];
  for (let depth = 0; level.length > 0; depth++) {
    if (depth > maxDepth) throw new Error(`storage listing deeper than maxDepth ${maxDepth}`);
    /** @type {string[]} */
    const children = [];
    await eachLimited(level, LIST_CONCURRENCY, async (current) => {
      let body;
      try {
        body = await request(client, 'GET', urlFor(client, current, true));
      } catch (err) {
        if (emptyIfMissing && depth === 0 && err instanceof StorageError && err.status === 404) return;
        throw err;
      }
      /** @type {unknown} */
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new Error(`storage listing of ${JSON.stringify(current)} is not JSON`);
      }
      if (!Array.isArray(parsed)) throw new Error(`storage listing of ${JSON.stringify(current)} is not an array`);
      for (const raw of /** @type {unknown[]} */ (parsed)) {
        const entry = /** @type {StorageEntry} */ (raw);
        if (typeof raw !== 'object' || raw === null) throw new Error('malformed storage entry');
        const rel = relOf(client, entry);
        all.push(entry);
        if (all.length > maxEntries) throw new Error(`storage listing exceeds maxEntries ${maxEntries}`);
        if (entry.IsDirectory) children.push(rel);
      }
    });
    level = children;
  }
  return all;
}

/**
 * PUT one file with its uppercase SHA-256 hex as `Checksum`. Rejects a `remotePath` containing `..`
 * (and any empty, `.` or `\`-bearing path) before any request.
 * @param {StorageClient} client
 * @param {string} remotePath zone-relative file path
 * @param {Uint8Array | string} body
 * @returns {Promise<void>}
 */
export async function upload(client, remotePath, body) {
  const url = urlFor(client, remotePath, false);
  const Checksum = createHash('sha256').update(body).digest('hex').toUpperCase();
  await request(client, 'PUT', url, { Checksum }, body);
}

/**
 * DELETE one listed file. Rejects a directory entry or a URL ending in `/` before any request.
 * @param {StorageClient} client
 * @param {StorageEntry} entry an entry returned by `listRecursive`
 * @returns {Promise<void>}
 */
export async function remove(client, entry) {
  if (entry.IsDirectory !== false) throw new Error('refusing to DELETE a directory entry');
  const url = urlFor(client, relOf(client, entry), false);
  if (url.endsWith('/')) throw new Error('refusing to DELETE a URL ending in "/"');
  await request(client, 'DELETE', url);
}

/**
 * Every file under `distDir`, sorted by path. Throws on a symlink anywhere (the root included), a
 * non-regular file, an entry name containing `..`, or a walk past the limits, so nothing outside
 * `distDir` is ever read.
 * @param {string} distDir
 * @param {ListLimits} [limits]
 * @returns {Promise<DistFile[]>}
 */
export async function walkDist(distDir, limits = {}) {
  const { maxDepth, maxEntries } = { ...DEFAULT_LIMITS, ...limits };
  const root = await lstat(distDir);
  if (root.isSymbolicLink()) throw new Error(`dist is a symlink: ${distDir}`);
  if (!root.isDirectory()) throw new Error(`dist is not a directory: ${distDir}`);
  /** @type {DistFile[]} */
  const files = [];
  /** @param {string} abs @param {string} rel @param {number} depth */
  const walk = async (abs, rel, depth) => {
    for (const name of (await readdir(abs)).sort()) {
      const path = rel ? `${rel}/${name}` : name;
      if (name.includes('..')) throw new Error(`dist entry contains "..": ${JSON.stringify(path)}`);
      const absolute = join(abs, name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`dist entry is a symlink: ${JSON.stringify(path)}`);
      if (info.isDirectory()) {
        if (depth + 1 > maxDepth) throw new Error(`dist deeper than maxDepth ${maxDepth}: ${JSON.stringify(path)}`);
        await walk(absolute, path, depth + 1);
      } else if (info.isFile()) {
        if (files.length >= maxEntries) throw new Error(`dist has more than maxEntries ${maxEntries} files`);
        files.push({ path, absolute });
      } else {
        throw new Error(`dist entry is not a regular file: ${JSON.stringify(path)}`);
      }
    }
  };
  await walk(distDir, '', 0);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
