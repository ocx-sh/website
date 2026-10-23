// LogoTile's eager half: the two capture listeners on `document` that see every logo image, and the
// settling of images that finished before the script ran (see logo-tile.mjs for the states). Kept apart
// from the monogram and `fillLogoTile` code so a page that only renders tiles ships this, nothing more.

const TILE = '.ocx-logo-tile';
const IMAGE = '.ocx-logo-tile__image';

/**
 * The image's outcome: `ok` paints it; a failure swaps in the image's `data-fallback` src once; a
 * failure with none left hides it, leaving the monogram.
 * @param {HTMLImageElement} img @param {boolean} ok
 */
function settle(img, ok) {
  const tile = /** @type {HTMLElement | null} */ (img.closest(TILE));
  if (!tile) return;
  if (ok) {
    tile.dataset['state'] = 'ready';
    return;
  }
  const fallback = img.getAttribute('data-fallback');
  if (fallback && !img.hasAttribute('data-retried')) {
    img.setAttribute('data-retried', '');
    img.src = fallback;
    return;
  }
  img.hidden = true;
  tile.dataset['state'] = 'fallback';
}

/** @param {Event} event */
const onImage = (event) => {
  const img = event.target;
  // A `load` event only fires on success; `error` on failure.
  if (img instanceof HTMLImageElement && img.matches(IMAGE)) settle(img, event.type === 'load');
};

let installed = false;

/**
 * Listen for every logo image on the page and settle those that already finished. Idempotent;
 * LogoTile.astro calls it from its page script, a consumer that clones tiles in later needs
 * nothing more.
 */
export function install() {
  if (!installed) {
    installed = true;
    document.addEventListener('load', onImage, true);
    document.addEventListener('error', onImage, true);
  }
  // ponytail: `complete` with no pixels reads as broken, so an SVG without an intrinsic size that
  // was cached before this ran falls back to the monogram; drop to events only if that bites.
  for (const img of document.querySelectorAll(`${IMAGE}[src]`)) {
    if (img instanceof HTMLImageElement && img.complete) settle(img, img.naturalWidth > 0);
  }
}
