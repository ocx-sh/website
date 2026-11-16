// Loads the term popup on the first hover or focus of a glossary term (`a.ocx-term`). One listener pair on the
// document, so a term in a Deferred fragment needs no scan. A failed load leaves the plain link.

/**
 * @param {Document} doc
 * @returns {void}
 */
export function watch(doc) {
  const types = ['pointerover', 'focusin'];
  /** @param {Event} event */
  const touch = (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('a.ocx-term')) return;
    for (const type of types) doc.removeEventListener(type, touch);
    import('./term-tip.mjs').then(
      (m) => m.start(doc, event),
      () => {},
    );
  };
  for (const type of types) doc.addEventListener(type, touch, { passive: true });
}
