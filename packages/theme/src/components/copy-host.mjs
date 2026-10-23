// CopyMenu's eager half (D-083): what must run before the lazy machine is live. Finds the host an
// event happened on and holds a context menu asked for early. Imports nothing: the copy and toast
// code (copy.mjs) and the Zag machine load on the first interaction with a host, never at page load.

/** A context-menu host (CopyMenu): any element inside the menu's root that carries its copy texts. */
export const COPY_HOST = '[data-copy]';

/**
 * The texts a host copies, `{ <item value>: text }`, read from its `data-copy` JSON. The data lives
 * on the host, never in script state, so a menu opened before its island is live copies the same.
 * @param {HTMLElement} host
 * @returns {Record<string, string> | null} null when absent, malformed, or without a string text
 */
export function copyMap(host) {
  try {
    /** @type {unknown} */
    const value = JSON.parse(host.dataset['copy'] ?? '');
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const map = Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string'));
    return Object.keys(map).length ? /** @type {Record<string, string>} */ (map) : null;
  } catch {
    return null;
  }
}

/**
 * The host an event on `root` happened on (D-083): the nearest `[data-copy]` of this root, with a
 * usable map. Empty space, a host of a nested widget and a host with bad data give null, so the
 * browser's own menu shows there instead of a menu with nothing to copy.
 * @param {HTMLElement} root a CopyMenu root
 * @param {EventTarget | null} target
 * @returns {{ host: HTMLElement, map: Record<string, string> } | null}
 */
export function hostOf(root, target) {
  const host = /** @type {HTMLElement | null} */ (
    /** @type {Partial<Element> | null} */ (target)?.closest?.(COPY_HOST) ?? null
  );
  const map = host && root.contains(host) && host.closest('[data-zag-root]') === root ? copyMap(host) : null;
  return host && map ? { host, map } : null;
}

/**
 * Starts a context-mode CopyMenu's lazy load on the first interaction with a host (D-083): nothing
 * loads at page load, and nothing on a hover over the container or a click on empty space. Focus on
 * a host and a touch or pen press on it start the load ahead of the request. A context menu asked
 * for before the machine is live is held: the lazy trigger layer replays only a click or a key, so
 * this starts the load and, once live, re-sends the event at the same spot. Only a host's event
 * counts (the browser's own menu stays on empty space), and the host's data is on the element, so
 * what the live menu copies is the same as if it had been live. The menu key and Shift+F10 reach
 * the browser as a `contextmenu` event on the focused host.
 * @param {HTMLElement} root a CopyMenu root in context mode, mounted with `trigger: 'manual'`
 * @param {{ start: () => Promise<void> }} handle the root's lazy `mount` handle
 */
export function holdEarlyContextMenu(root, handle) {
  // The request was already swallowed (preventDefault) or its trigger was not a request at all: say why nothing opened.
  const load = () => handle.start().catch((error) => console.warn('ocx-theme: the copy menu failed to load', error));
  /** @param {Event} event */
  const prefetch = (event) => {
    if (hostOf(root, event.target)) void load();
  };
  root.addEventListener('focusin', prefetch);
  root.addEventListener('pointerdown', (event) => event.pointerType !== 'mouse' && prefetch(event));
  root.addEventListener('contextmenu', (event) => {
    if (root.dataset['zagState'] === 'live' || !hostOf(root, event.target)) return;
    event.preventDefault();
    const { clientX, clientY, target } = event;
    void load().then(() => {
      if (root.dataset['zagState'] === 'live')
        target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }));
    });
  });
}
