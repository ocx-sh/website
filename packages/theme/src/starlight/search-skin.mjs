// Pagefind's skin, requested when the search dialog first opens: Pagefind's own sheet in Starlight's layer, then
// search-results.css (the theme's skin for it). Never a link in the page, which would block every first paint, nor
// a string in a script chunk, which the JS budget counts.

/**
 * Resolves on load or error, and after `ms` regardless: an unskinned UI beats none. A `<style>` that `@import`s a sheet
 * fires `load` once that sheet has loaded too. @param {HTMLLinkElement | HTMLStyleElement} el @param {number} ms
 */
const loaded = (el, ms) =>
  new Promise((resolve) => {
    el.onload = el.onerror = () => resolve(undefined);
    setTimeout(resolve, ms);
    document.head.append(el);
  });

/** @type {Promise<unknown> | undefined} */
let skin;

/**
 * Adds both sheets once and resolves when they have loaded. A rejected load is forgotten, so the next open tries again.
 * @returns {Promise<unknown>}
 */
export function loadSkin() {
  skin ??= (async () => {
    const { default: uiCss } = await import('@pagefind/default-ui/css/ui.css?url');
    const base = document.createElement('style');
    base.textContent = `@import url("${uiCss}") layer(starlight.core);`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./search-results.css', import.meta.url).href;
    return Promise.all([loaded(base, 3000), loaded(link, 3000)]);
  })().catch((error) => {
    skin = undefined;
    throw error;
  });
  return skin;
}
