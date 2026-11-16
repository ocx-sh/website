/** Forget the fetched data: tests start from none. */
export function reset(): void;
/**
 * Wires every `a.ocx-term` of `doc`, present and later inserted (the listeners are on the document), to the one
 * shared popup, and opens the popup for `first`, the event that loaded this module. Focus opens at once, hover
 * after {@link HOVER_MS}; the pointer may move onto the popup; Escape, blur and pointer leave (unless the term is
 * focused) and a scroll (unless focused) close it; one popup is open at a time; the open term carries
 * `aria-describedby` only while it is open.
 * @param {Document} doc
 * @param {Event} [first]
 * @param {{ url?: string }} [options] `url` of the definitions; default `<base>glossary.json`
 * @returns {() => void} stops listening and closes the popup (a test's cleanup)
 */
export function start(doc: Document, first?: Event, { url }?: {
    url?: string;
}): () => void;
export const GRACE_MS: 100;
/** Hover-intent delay in ms before a hovered term opens its popup; focus opens it at once. */
export const HOVER_MS: 400;
export type Definitions = Record<string, [term: string, definition: string]>;
