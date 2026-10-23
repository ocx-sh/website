/**
 * Adds the button to every enhanceable `pre` under `doc` and wires one delegated click.
 * @param {Document} doc
 */
export function enhanceProseCode(doc: Document): void;
/** Prose roots, as base.css styles them. Expressive Code frames bring their own button. */
export const PROSE_PRE: ":is(.ocx-prose, .sl-markdown-content, .vp-doc) pre";
/** What the toast names (D-064). */
export const CODE_MEANING: "code block";
