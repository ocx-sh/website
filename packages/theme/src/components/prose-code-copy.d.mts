/**
 * Adds the "Copy code" button to one enhanceable `pre` (once) and wires the document's delegated
 * listeners (once).
 * @param {Element} pre
 */
export function enhancePre(pre: Element): void;
/**
 * Enhances every code block under `doc` (a consumer that renders prose at once; the page script uses
 * `onRoots(PROSE_PRE, enhancePre)` so blocks inserted later are covered).
 * @param {Document} doc
 */
export function enhanceProseCode(doc: Document): void;
/** Prose roots, as base.css styles them. Expressive Code frames bring their own button. */
export const PROSE_PRE: ":is(.ocx-prose, .sl-markdown-content, .vp-doc) pre";
/** What the toast names (D-064). */
export const CODE_MEANING: "code block";
