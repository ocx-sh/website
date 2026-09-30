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
export function revealOnIntersect(sections) {
  if (typeof IntersectionObserver !== 'function') {
    for (const s of sections) s.setAttribute('data-revealed', '');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const first = !e.target.hasAttribute('data-pending');
        if (
          !e.isIntersecting &&
          first &&
          e.boundingClientRect.top >= (e.target.ownerDocument.defaultView?.innerHeight ?? Infinity)
        ) {
          e.target.setAttribute('data-pending', '');
          continue;
        }
        // Intersecting, or on screen at its first report (the -10% band, or above).
        if (!e.isIntersecting && !first) continue;
        e.target.removeAttribute('data-pending');
        e.target.setAttribute('data-revealed', '');
        io.unobserve(e.target);
      }
    },
    // As RoadmapItem (43d3f2dc9): reveal once the section is 10% clear of the bottom edge.
    { rootMargin: '0px 0px -10% 0px' },
  );
  for (const s of sections) io.observe(s);
}
