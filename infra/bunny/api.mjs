// The Bunny management API client; every `bunny:*` task and the owner's fixture recorder go through it.

/**
 * @typedef {object} ClientOptions
 * @property {string} [baseUrl] API origin, `https://api.bunny.net` by default; tests point it at the fake
 * @property {typeof globalThis.fetch} [fetch] injected in tests
 * @property {number} [timeoutMs] per-request timeout
 * @property {(ms: number) => Promise<void>} [sleep] injected in tests; waits between GET retries
 * @property {(line: string) => void} [log] receives one already-redacted line per request and retry
 */

/**
 * @typedef {object} BunnyClient
 * @property {(method: string, path: string, body?: unknown) => Promise<unknown>} request parsed JSON, `null` for an empty body
 * @property {(path: string) => Promise<unknown>} get the only method that is retried
 * @property {(path: string, body?: unknown) => Promise<unknown>} post
 * @property {(path: string) => Promise<unknown>} delete
 */

const DEFAULT_BASE_URL = 'https://api.bunny.net';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 250;
/** Longest wait a `Retry-After` can ask for. */
const MAX_RETRY_AFTER_MS = 60_000;
/** Longest slice of a response body quoted in an error. */
const BODY_QUOTE = 200;
const SECRET_NAME = /(key|secret|password|token)$/i;

/** Exit codes of every `bunny:*` command that writes: 0 done, 1 refused or failed, 2 bad arguments. */
export const EXIT = { ok: 0, refused: 1, usage: 2 };

/**
 * The entry of a list response with this `Name`: the API answers an array, or `{ Items }` when paged.
 * @param {unknown} list
 * @param {string} name
 * @returns {Record<string, unknown> | undefined}
 * @throws {Error} when `list` holds no array of entries
 */
export function findByName(list, name) {
  const items = Array.isArray(list) ? list : /** @type {{ Items?: unknown } | null} */ (list)?.Items;
  if (!Array.isArray(items)) throw new Error('list response has no items');
  return /** @type {Record<string, unknown>[]} */ (items).find((z) => z.Name === name);
}

/** A failed API request. `status` is the HTTP status, or 0 when no response arrived. */
export class BunnyApiError extends Error {
  /**
   * @param {string} message already redacted
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.name = 'BunnyApiError';
    this.status = status;
  }
}

/** The client refused to start: running in CI, or no key. Carries the process exit code. */
export class RefusalError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RefusalError';
    this.exitCode = 1;
  }
}

/**
 * A copy of `json` with every field named `/(key|secret|password|token)$/i` set to an empty string,
 * at any depth. The input is not mutated.
 * @param {unknown} json
 * @returns {unknown}
 */
export function redact(json) {
  if (Array.isArray(json)) return json.map(redact);
  if (json !== null && typeof json === 'object') {
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, SECRET_NAME.test(k) ? '' : redact(v)]));
  }
  return json;
}

/**
 * Replace every occurrence of the key, raw and URL-encoded, with `***`. Split/join, not a regex:
 * the key is arbitrary text.
 * @param {string} key
 * @param {string} text
 * @returns {string}
 */
function mask(key, text) {
  let out = text;
  for (const form of new Set([key, encodeURIComponent(key)])) {
    if (form) out = out.split(form).join('***');
  }
  return out;
}

/**
 * Milliseconds a `Retry-After` header asks for, capped; `undefined` when absent or unparsable.
 * @param {string | null} value delta-seconds or an HTTP date
 * @returns {number | undefined}
 */
function retryAfterMs(value) {
  if (!value) return undefined;
  const ms = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isNaN(ms) ? undefined : Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

/**
 * A client for one run. Takes the environment explicitly: only a CLI `main` passes `process.env`.
 * Refuses (throws `RefusalError`, exit code 1) before any request when `env.CI` is set or
 * `env.BUNNY_API_KEY` is empty: the account key never belongs in CI.
 * @param {Record<string, string | undefined>} env
 * @param {ClientOptions} [options]
 * @returns {BunnyClient}
 */
export function createClient(env, options = {}) {
  if (env.CI) throw new RefusalError('refusing to run with CI set: the account key never belongs in CI');
  const key = env.BUNNY_API_KEY?.trim() ?? '';
  if (!key) throw new RefusalError('refusing to run: BUNNY_API_KEY is empty');

  const base = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
  const doFetch = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const log = (/** @type {string} */ line) => options.log?.(mask(key, line));

  /**
   * One attempt. Every failure is a `BunnyApiError` whose text has the key replaced; the original
   * error is not attached as `cause` because it can carry the key.
   * @param {string} method
   * @param {string} path
   * @param {unknown} body
   * @returns {Promise<{ json: unknown, retryable: boolean, wait?: number }>}
   */
  async function attempt(method, path, body) {
    const url = new URL(path, base);
    // A path like `//evil.test/x` would carry the AccessKey to another host.
    if (!path.startsWith('/') || url.host !== base.host)
      throw new BunnyApiError(`invalid path: ${JSON.stringify(path)}`, 0);
    let res;
    let text;
    try {
      res = await doFetch(url, {
        method,
        headers: {
          AccessKey: key,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      text = await res.text();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw Object.assign(new BunnyApiError(mask(key, `${method} ${path} failed: ${reason}`).slice(0, 500), 0), {
        retryable: true,
      });
    }
    if (!res.ok) {
      // Mask before cutting: cutting first could leave a key prefix that no longer matches.
      const quoted = mask(key, text).slice(0, BODY_QUOTE);
      const err = new BunnyApiError(`${method} ${path} failed: ${res.status} ${quoted}`.trim(), res.status);
      throw Object.assign(err, {
        retryable: res.status >= 500 || res.status === 429,
        wait: retryAfterMs(res.headers.get('retry-after')),
      });
    }
    try {
      return { json: text.trim() === '' ? null : JSON.parse(text), retryable: false };
    } catch {
      throw new BunnyApiError(`${method} ${path} returned invalid JSON`, res.status);
    }
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {unknown} [body]
   * @returns {Promise<unknown>}
   */
  async function request(method, path, body) {
    // Only a GET is retried: a POST or DELETE that failed midway may have applied, so the caller re-reads.
    const attempts = method === 'GET' ? MAX_ATTEMPTS : 1;
    for (let n = 1; ; n++) {
      try {
        const { json } = await attempt(method, path, body);
        log(`${method} ${path} ok`);
        return json;
      } catch (err) {
        const e = /** @type {BunnyApiError & { retryable?: boolean, wait?: number }} */ (err);
        if (!e.retryable || n >= attempts) {
          log(`${method} ${path} failed: ${e.status}`);
          // Strip the retry bookkeeping: callers see a plain BunnyApiError.
          throw new BunnyApiError(e.message, e.status);
        }
        const wait = e.wait ?? BACKOFF_MS * 2 ** (n - 1);
        log(`${method} ${path} attempt ${n}/${attempts} failed: ${e.status}, retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  return {
    request,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    delete: (path) => request('DELETE', path),
  };
}
