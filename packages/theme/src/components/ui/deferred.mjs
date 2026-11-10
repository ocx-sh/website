// Deferred's loader (Deferred.astro starts it through lazy.mjs, trigger `idle`): fetches the fragment
// page, adopts its stylesheets and waits for them, inserts its body, re-creates its scripts, announces
// `ocx:inserted` (ui/roots.mjs mounts from it) and fades the content in. Error or timeout keeps the
// box, stops the sweep and shows Retry. The fragment is the site's own build, never user content
// (fetch-html.mjs allows same origin only; its scripts and stylesheets must be same-origin too).
import { forget, load } from './fetch-html.mjs';
import errorCss from './deferred-error.css?inline';

/** The failed state's rules (deferred-error.css, built and minified by `?inline`), adopted only when a load fails: no page pays for them in its head. */
const ERROR_CSS = errorCss;
/** @type {WeakSet<Document>} */
const errorStyled = new WeakSet();
/** @param {Document} doc */
const styleError = (doc) => {
  if (errorStyled.has(doc) || typeof CSSStyleSheet === 'undefined' || !doc.adoptedStyleSheets) return;
  errorStyled.add(doc);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(ERROR_CSS);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
};

/**
 * Stylesheets this loader added to a document and is still waiting for, by href: a second fragment on the same
 * page that needs one must wait for it too, not insert its content unstyled.
 * @type {WeakMap<Document, Map<string, Promise<void>>>}
 */
const loading = new WeakMap();

/**
 * A stylesheet still pending after this long (a stalled connection) no longer holds the content back: unstyled
 * content beats none, and the link stays in the head to finish. A stylesheet that fails is another matter: it is
 * removed and the load fails, so Retry fetches it again.
 */
const SHEET_MS = 10_000;

/**
 * Starts loading into a `[data-ocx-deferred]` root. Called once by lazy.mjs; Retry calls `run` again.
 * @param {HTMLElement} root
 * @returns {void}
 */
export function start(root) {
  root.querySelector('[data-deferred-retry]')?.addEventListener('click', () => {
    // The button is about to be hidden: keep focus on the box.
    root.focus();
    void run(root);
  });
  void run(root);
}

/** @param {HTMLElement} root @returns {Promise<void>} */
async function run(root) {
  const doc = root.ownerDocument;
  const content = /** @type {HTMLElement} */ (root.querySelector('[data-deferred-content]'));
  const error = /** @type {HTMLElement} */ (root.querySelector('[data-deferred-error]'));
  const src = root.dataset['src'] ?? '';
  error.hidden = true;
  root.dataset['state'] = 'loading';
  root.setAttribute('aria-busy', 'true');
  try {
    const url = new URL(src, doc.baseURI);
    const fragment = new DOMParser().parseFromString(await load(src, doc, true), 'text/html');
    // Nothing to show is a failed load (an error page, plain text, an empty file), never a blank box.
    if (!fragment.body.childElementCount) throw new Error(`fetch: ${url.href} holds no markup`);
    await adoptStyles(fragment, url, doc);
    const scripts = refreshScripts(fragment, doc, url);
    content.replaceChildren(...doc.adoptNode(fragment.body).childNodes);
    // Only now, in the live document, may a script start: one inserted into the parsed tree would be
    // marked started there and never run.
    for (const [at, script] of scripts.body) at.replaceWith(script);
    doc.head.append(...scripts.head);
    root.dataset['state'] = 'loaded';
    root.setAttribute('data-loaded', '');
    root.removeAttribute('aria-busy');
    content.dispatchEvent(new CustomEvent('ocx:inserted', { bubbles: true }));
    root.dispatchEvent(new CustomEvent('ocx:deferred:load', { bubbles: true, detail: { ok: true } }));
  } catch (cause) {
    console.warn('[ocx] Deferred failed to load', src, cause);
    forget(src, doc); // an empty or unusable 200 would otherwise be served again to Retry
    styleError(doc);
    root.dataset['state'] = 'error';
    root.removeAttribute('aria-busy');
    error.hidden = false;
    root.dispatchEvent(new CustomEvent('ocx:deferred:load', { bubbles: true, detail: { ok: false } }));
  }
}

/**
 * Moves the fragment's stylesheets and style elements into the document head (removing them from the fragment), each only if the page does not
 * have it yet (a link by resolved href, a style by text), and resolves once every new link has loaded.
 * @param {Document} fragment
 * @param {URL} base the fragment's URL: relative hrefs resolve against it
 * @param {Document} doc
 * @returns {Promise<void>}
 */
async function adoptStyles(fragment, base, doc) {
  const hrefs = new Set(
    [...doc.querySelectorAll('link[rel~="stylesheet"]')].map((l) => /** @type {HTMLLinkElement} */ (l).href),
  );
  const texts = new Set([...doc.querySelectorAll('style')].map((s) => s.textContent));
  /** @type {Map<string, Promise<void>>} */
  const inFlight = loading.get(doc) ?? new Map();
  loading.set(doc, inFlight);
  /** @type {Promise<void>[]} */
  const pending = [];
  for (const el of fragment.querySelectorAll('link[rel~="stylesheet"], style')) {
    el.remove(); // adopted into the head (or already there): the body keeps no copy
    if (el instanceof HTMLStyleElement) {
      const text = el.textContent ?? '';
      if (texts.has(text)) continue;
      texts.add(text);
      const style = doc.createElement('style');
      style.textContent = text;
      doc.head.append(style);
      continue;
    }
    const target = new URL(el.getAttribute('href') ?? '', base);
    if (target.origin !== doc.location.origin) continue;
    const href = target.href;
    if (hrefs.has(href)) {
      const other = inFlight.get(href);
      if (other) pending.push(other);
      continue;
    }
    hrefs.add(href);
    const loaded = /** @type {Promise<void>} */ (
      new Promise((done, fail) => {
        const link = doc.createElement('link');
        const cap = setTimeout(done, SHEET_MS);
        link.rel = 'stylesheet';
        link.onload = () => (clearTimeout(cap), done(undefined));
        link.onerror = () => {
          clearTimeout(cap);
          link.remove(); // a later fragment (or Retry) asks for it again
          fail(new Error(`stylesheet ${href} failed to load`));
        };
        link.href = href;
        doc.head.append(link);
      })
    ).finally(() => {
      inFlight.delete(href);
    });
    inFlight.set(href, loaded);
    pending.push(loaded);
  }
  await Promise.all(pending);
}

/**
 * Prepares fresh, runnable copies of the fragment's scripts (scripts from DOMParser never run). A script
 * with a `src` the page already runs is dropped: its module ran, and `ocx:inserted` makes it mount the
 * new markup. An inline module is dropped when the page holds the same text; a classic inline script
 * always runs again (under a strict CSP its hash must be allowed). Data blocks such as
 * `application/json` stay as they are. A body script leaves a comment where it stood, to be replaced by
 * its copy once the body is in the page; head scripts are appended to the document head.
 * A relative `src` resolves against the fragment's URL, as its stylesheets do; a `src` from another origin is dropped.
 * @param {Document} fragment
 * @param {Document} doc
 * @param {URL} base the fragment's URL
 * @returns {{ body: [Comment, HTMLScriptElement][], head: HTMLScriptElement[] }}
 */
function refreshScripts(fragment, doc, base) {
  const hrefs = new Set([...doc.querySelectorAll('script[src]')].map((s) => /** @type {HTMLScriptElement} */ (s).src));
  const modules = new Set([...doc.querySelectorAll('script[type="module"]:not([src])')].map((s) => s.textContent));
  /** @type {[Comment, HTMLScriptElement][]} */
  const body = [];
  /** @type {HTMLScriptElement[]} */
  const head = [];
  for (const old of fragment.querySelectorAll('script')) {
    const inHead = old.closest('head') !== null;
    if (!['', 'module', 'text/javascript'].includes(old.type)) {
      if (inHead) old.remove();
      continue;
    }
    const src = old.getAttribute('src');
    const target = src ? new URL(src, base) : null;
    if (target && target.origin !== doc.location.origin) {
      old.remove();
      continue;
    }
    const key = target ? target.href : old.type === 'module' ? old.textContent : null;
    const seen = src ? hrefs : modules;
    if (key !== null && seen.has(key)) {
      old.remove();
      continue;
    }
    if (key !== null) seen.add(key);
    const fresh = doc.createElement('script');
    for (const { name, value } of old.attributes) fresh.setAttribute(name, value);
    if (src) fresh.src = key ?? src;
    else fresh.textContent = old.textContent;
    if (inHead) {
      old.remove();
      head.push(fresh);
    } else {
      const at = fragment.createComment('');
      old.replaceWith(at);
      body.push([at, fresh]);
    }
  }
  return { body, head };
}
