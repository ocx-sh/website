// The ProgressCircle ring as one markup string: ProgressCircle.astro sets it via `set:html`, and the
// toast's lazy chunk calls it directly, so the ring has a single source. Plain JS, no DOM, no Astro,
// so the chunk imports it cheaply. Styles: ./progress-circle.css. The ring is decorative: the
// wrapper carries `role="progressbar"` and the name (the toast's live region announces its title).

/** @typedef {'s' | 'm' | 'l'} ProgressCircleSize */

/**
 * @param {{ value?: number | undefined, size?: ProgressCircleSize }} [options] `value` 0–100 (clamped); absent
 *   or NaN = indeterminate, a quarter arc the stylesheet spins.
 * @returns {string} an `<svg>` string
 */
export function progressCircleSvg({ value, size = 'm' } = {}) {
  const determinate = typeof value === 'number' && !Number.isNaN(value);
  const v = determinate ? Math.round(Math.min(100, Math.max(0, value)) * 10) / 10 : 0;
  // A zero-length dash under a square cap still paints a dot: hide the fill at 0.
  const fill = determinate ? `stroke-dasharray="${v} 100"${v === 0 ? ' opacity="0"' : ''}` : '';
  return (
    `<svg class="ocx-ui-progress-circle__ring" data-size="${size}" data-state="${determinate ? 'determinate' : 'indeterminate'}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">` +
    `<circle data-part="track" cx="12" cy="12" r="10" pathLength="100"/>` +
    `<circle data-part="fill" cx="12" cy="12" r="10" pathLength="100" transform="rotate(-90 12 12)" ${fill}/>` +
    `</svg>`
  );
}
