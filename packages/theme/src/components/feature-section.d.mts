/**
 * Reveal each section once it first intersects the viewport, from inside the
 * (asynchronous) IntersectionObserver callback — never synchronously on mount
 * (ocx 43d3f2dc9). Only a section wholly below the viewport on its first report
 * is hidden (`data-pending`) until it scrolls in; one already on screen is never
 * hidden, so first-paint content stays visible (no flash, LCP not held back by
 * this script) and just plays the settle glow. One-shot: a revealed section is
 * unobserved and never hidden again. Without IntersectionObserver the sections
 * are revealed at once.
 * @param {Iterable<Element>} sections
 * @returns {void}
 */
export function revealOnIntersect(sections: Iterable<Element>): void;
