// Fetch-on-open for Popover (an HTML fragment) and Hint (plain text): the `src` prop. SSR writes
// `data-fill-src` on the component root; the lazy `popover.zag.mjs` / `tooltip.zag.mjs` call `fillOnOpen`
// from `onOpenChange` (Popover also from `render`, for a panel that starts open), so nothing is fetched before the machine is live and the part is opened (the loading
// model of AGENTS.md). No module of its own: it ships inside the two lazy chunks that already load on
// interaction. The first open fetches, a later open reuses the result, a failure is retried by `Retry`.
import { emit } from './zag-runtime.mjs';

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
function load(src, doc, html) {
  const view = /** @type {Window} */ (doc.defaultView);
  /** @type {URL} */ let url;
  try {
    url = new URL(src, doc.baseURI);
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(`fill: bad src ${src}`));
  }
  const key = url.href;
  // Before the cache: a text result a Hint cached from another origin must never reach innerHTML.
  if (html && url.origin !== view.location.origin) return Promise.reject(new Error(`fill: ${key} is not same-origin`));
  const hit = cache.get(key);
  if (hit) return hit;
  const request = view
    .fetch(key, { credentials: 'same-origin', signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((res) => {
      if (!res.ok) throw new Error(`fill: ${key} answered ${res.status}`);
      return res.text(); // the signal also aborts a body that never ends
    });
  cache.set(key, request);
  // A failure is not kept: Retry fetches again.
  request.catch(() => cache.delete(key));
  return request;
}

/**
 * Popover: fills the root's `[data-fill]` region the first time the panel opens.
 * States on the region (`data-fill-state`): `idle` → `loading` → `ready` | `error`; Retry re-enters `loading`.
 * @param {HTMLElement} root the `.ocx-ui-popover` with `data-fill-src`
 * @returns {void}
 */
function fillPopover(root) {
  const region = /** @type {HTMLElement | null} */ (root.querySelector('[data-fill]'));
  const src = root.dataset['fillSrc'];
  if (!region || !src) return;
  const state = region.dataset['fillState'];
  if (state === 'loading' || state === 'ready') return;
  // Retry hides the error block that holds the focused button: keep focus in the panel.
  if (region.contains(root.ownerDocument.activeElement))
    /** @type {HTMLElement | null} */ (region.closest('[data-part="content"]'))?.focus();
  region.dataset['fillState'] = 'loading';
  region.setAttribute('aria-busy', 'true');
  load(src, root.ownerDocument, true).then(
    (html) => {
      region.innerHTML = html; // a same-origin fragment of the site's own build, never user content
      region.dataset['fillState'] = 'ready';
      region.removeAttribute('aria-busy');
      emit(root, 'popover', 'fill', { ok: true });
    },
    () => {
      region.dataset['fillState'] = 'error';
      region.removeAttribute('aria-busy');
      const retry = /** @type {HTMLButtonElement | null} */ (region.querySelector('[data-fill-retry]'));
      if (retry) retry.onclick = () => fillPopover(root);
      emit(root, 'popover', 'fill', { ok: false });
    },
  );
}

/**
 * Hint: replaces the content's text (the `label`, which stays on failure) the first time the hint shows.
 * @param {HTMLElement} root the `.ocx-ui-hint` with `data-fill-src`
 * @returns {void}
 */
function fillHint(root) {
  const content = root.querySelector('[data-part="content"]');
  const src = root.dataset['fillSrc'];
  if (!content || !src || root.dataset['fillState']) return;
  root.dataset['fillState'] = 'loading';
  load(src, root.ownerDocument, false).then(
    (text) => {
      content.textContent = text.trim();
      root.dataset['fillState'] = 'ready';
      emit(root, 'hint', 'fill', { ok: true });
    },
    () => {
      delete root.dataset['fillState']; // the next show tries again
      emit(root, 'hint', 'fill', { ok: false });
    },
  );
}

/**
 * Call from a machine's `onOpenChange`: fetches on an open of a root that has `data-fill-src`.
 * @param {HTMLElement} root
 * @param {'popover' | 'hint'} kind
 * @param {boolean} open
 * @returns {void}
 */
export function fillOnOpen(root, kind, open) {
  if (!open || !root.dataset['fillSrc']) return;
  if (kind === 'popover') fillPopover(root);
  else fillHint(root);
}
