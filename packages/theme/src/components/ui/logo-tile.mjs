// Stable public API, exported as `@ocx-sh/theme/logo-tile`.
// LogoTile: a logo over a monogram in one reserved box. The monogram (initials on a
// hash-picked hue) paints with the markup; the logo stacks over it and cross-fades in once it has
// loaded; a logo that fails leaves the monogram standing. No inline handler anywhere (CSP): two
// capture listeners on `document` see every logo image, server-rendered or cloned in later, and
// `install()` settles the images that finished before the script ran (a cached or already broken
// one fires no event afterwards).
//
// `data-state` on `.ocx-logo-tile`: `loading` (logo requested, monogram shows), `ready` (logo
// painted), `fallback` (no logo, or every candidate failed: monogram shows), `empty` (no logo and
// no initials: the cube shows, rendered by LogoTile.astro only for that case).

const IMAGE = '.ocx-logo-tile__image';

export { install } from './logo-tile-install.mjs';

/**
 * Up to two initials for a tile, from a bare name: the first character of the first two
 * alphanumeric segments (`cmake-tools` → `CT`), else the name's first two characters (`cmake` → `CM`).
 * A pure function of its input, so server and client render the same tile.
 * @param {string} name
 * @returns {string}
 */
export function monogramInitials(name) {
  const segments = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const [first, second] = segments;
  return first && second ? (first.charAt(0) + second.charAt(0)).toUpperCase() : name.slice(0, 2).toUpperCase();
}

/**
 * The hue index (0-3, `--ocx-color-monogram-<n>`) for `seed`: a djb2 hash, pure like the initials.
 * @param {string} seed
 * @returns {0 | 1 | 2 | 3}
 */
export function monogramHue(seed) {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  return /** @type {0 | 1 | 2 | 3} */ (Math.abs(hash) % 4);
}

/**
 * Fill a tile in place (a clone of a LogoTile rendered with no name and no `src`): the monogram, the
 * hue and the logo, with the failure state and the fallback retry reset, so a recycled tile
 * starts clean. `src` is used as given (join the base yourself).
 * @param {Element} tile
 * @param {{ name: string, seed?: string, src?: string | null, fallback?: string | null }} fill `seed` defaults to `name`; `fallback` is tried once if `src` fails
 */
export function fillLogoTile(tile, { name, seed = name, src = null, fallback = null }) {
  const root = /** @type {HTMLElement} */ (tile);
  const initials = monogramInitials(name);
  const face = root.querySelector('.ocx-logo-tile__initials');
  if (face) face.textContent = initials;
  root.dataset['hue'] = String(monogramHue(seed));
  const img = /** @type {HTMLImageElement | null} */ (root.querySelector(IMAGE));
  if (img) {
    img.removeAttribute('data-retried');
    if (fallback) img.setAttribute('data-fallback', fallback);
    else img.removeAttribute('data-fallback');
    img.hidden = src === null;
    if (src === null) img.removeAttribute('src');
    else img.src = src;
  }
  root.dataset['state'] = src !== null ? 'loading' : initials ? 'fallback' : 'empty';
}
