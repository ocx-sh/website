// One registry icon as an inline <svg> string, the same markup `ui/Icon.astro` renders. For places
// that carry an icon through an attribute (Select options: the popup rows are built by script).
import { ICONS } from './icons.mjs';

/** @param {import('./icons.mjs').IconName} name @returns {string} */
export function iconSvg(name) {
  const { viewBox, body, stroke } = ICONS[name];
  const paint = stroke
    ? ` fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"`
    : ' fill="currentColor"';
  return `<svg class="ocx-icon" data-icon="${name}" viewBox="${viewBox}"${paint} aria-hidden="true">${body}</svg>`;
}
