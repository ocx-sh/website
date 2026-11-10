// Same-origin fetch with a per-page cache and a 10 s timeout, shared by `fill.mjs` (Popover/Hint
// fetch-on-open) and `deferred.mjs`. Imports nothing: `fill.mjs` pulls in Zag, this must not.

/** Results by resolved URL for the page's life, shared by every part with that `src`. @type {Map<string, Promise<string>>} */
const cache = new Map();

/** A request, headers and body together, gives up after this long and shows the error state. */
const TIMEOUT_MS = 10_000;

/**
 * @param {string} src
 * @param {Document} doc
 * @param {boolean} html a fragment inserted as markup: same origin only
 * @returns {Promise<string>}
 */
export function load(src, doc, html) {
  const view = /** @type {Window} */ (doc.defaultView);
  /** @type {URL} */ let url;
  try {
    url = new URL(src, doc.baseURI);
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(`fetch: bad src ${src}`));
  }
  const key = url.href;
  // Before the cache: a text result a Hint cached from another origin must never reach innerHTML.
  if (html && url.origin !== view.location.origin) return Promise.reject(new Error(`fetch: ${key} is not same-origin`));
  const hit = cache.get(key);
  if (hit) return hit;
  const request = view
    .fetch(key, { credentials: 'same-origin', signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((res) => {
      if (!res.ok) throw new Error(`fetch: ${key} answered ${res.status}`);
      return res.text(); // the signal also aborts a body that never ends
    });
  cache.set(key, request);
  // A failure is not kept: Retry fetches again.
  request.catch(() => cache.delete(key));
  return request;
}

/**
 * Drops a kept result, for a caller that found the text unusable: Retry must fetch again, not read the same text.
 * @param {string} src
 * @param {Document} doc
 */
export function forget(src, doc) {
  cache.delete(new URL(src, doc.baseURI).href);
}
