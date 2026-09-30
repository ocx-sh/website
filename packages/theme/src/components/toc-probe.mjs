// Scroll-spy probe shared by the Zag Toc and the Starlight TOC override (the latter inlines
// `String(probe)`, so this stays one self-contained arrow function: no imports, no outer names).

/**
 * Index of the active heading. A jump lands a heading at `pad` (the page's `scroll-padding-top`);
 * the band starts 8px below that (Starlight's own: 2rem under the header, headings land 1.5rem
 * under it), so a heading the reader jumped to is inside it. A probe line sits at the band top and
 * slides linearly to the viewport bottom over the last screenful of scroll (`min(h - b, max)`,
 * `b` the band top), so the page can always reach the last heading and each short trailing section takes its turn
 * on the way there. Active = the last heading whose top is at or above the probe, -1 when none is
 * (the Zag Toc then shows no entry, as its server render does; the Starlight TOC falls back to its
 * first link).
 *
 * Jump rule: while the view sits where a jump to heading `j` (the `location.hash` target) puts it,
 * that heading is active, even in the final screen where the probe has slid below it: the scroll
 * offset equals the heading's offset less `pad`, clamped to the scroll range, within 2px. The next
 * scroll that moves the heading hands back to the probe.
 * ponytail: stateless, so scrolling back to exactly that offset honours the hash again; keep a
 * landed/left flag per spy if that ever reads wrong (every docs page pays the inline bytes).
 * No comments inside the body: the inlined copy joins its lines.
 * @param {number[]} tops heading tops in document order (`getBoundingClientRect().top`)
 * @param {number} pad where a jump lands a heading (viewport px): the page's `scroll-padding-top`
 * @param {number} h viewport height
 * @param {number} sh document scroll height
 * @param {number} y scroll offset
 * @param {number} j index of the jump target, -1 when none
 * @returns {number}
 */
export const probe = (tops, pad, h, sh, y, j) => {
  const max = sh - h,
    b = pad + 8,
    s = Math.min(h - b, max),
    p = b + (s > 0 ? Math.min(1, Math.max(0, 1 - (max - y) / s)) : 1) * (h - b);
  return Math.abs(Math.min(Math.max((tops[j] ?? NaN) + y - pad, 0), max) - y) <= 2
    ? j
    : tops.findLastIndex((t) => t <= p + 1);
};
