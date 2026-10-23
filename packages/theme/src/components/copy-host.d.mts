/**
 * The texts a host copies, `{ <item value>: text }`, read from its `data-copy` JSON. The data lives
 * on the host, never in script state, so a menu opened before its island is live copies the same.
 * @param {HTMLElement} host
 * @returns {Record<string, string> | null} null when absent, malformed, or without a string text
 */
export function copyMap(host: HTMLElement): Record<string, string> | null;
/**
 * The host an event on `root` happened on (D-083): the nearest `[data-copy]` of this root, with a
 * usable map. Empty space, a host of a nested widget and a host with bad data give null, so the
 * browser's own menu shows there instead of a menu with nothing to copy.
 * @param {HTMLElement} root a CopyMenu root
 * @param {EventTarget | null} target
 * @returns {{ host: HTMLElement, map: Record<string, string> } | null}
 */
export function hostOf(root: HTMLElement, target: EventTarget | null): {
    host: HTMLElement;
    map: Record<string, string>;
} | null;
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
export function holdEarlyContextMenu(root: HTMLElement, handle: {
    start: () => Promise<void>;
}): void;
/** A context-menu host (CopyMenu): any element inside the menu's root that carries its copy texts. */
export const COPY_HOST: "[data-copy]";
