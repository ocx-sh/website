// Motion contract helper (C-302, D-R7 f): a node the script removes leaves through `leave(el)`.
// Internal to components/, not a package export. Renderers that diff children by key (TagsInput,
// TagGroup) skip `[data-leaving]` nodes, so a leaving node never counts as a live item.

/** A duration token's computed value (`0.15s`, `150ms`, empty) in ms; empty or unparsable is 0. @param {string} value */
const ms = (value) => (parseFloat(value) || 0) * (value.trim().endsWith('ms') ? 1 : 1000);

/**
 * Fade and shrink `el` out on `--ocx-duration-base` / `--ocx-ease-out`, then remove it. At once when
 * the token is 0 (reduced motion zeroes it). The node is `inert` and `data-leaving` meanwhile.
 * @param {HTMLElement} el
 * @returns {Promise<void>} resolves after the node is removed
 */
export function leave(el) {
  el.inert = true;
  el.setAttribute('data-leaving', '');
  const style = getComputedStyle(el);
  const duration = ms(style.getPropertyValue('--ocx-duration-base'));
  if (!duration) {
    el.remove();
    return Promise.resolve();
  }
  const easing = style.getPropertyValue('--ocx-ease-out').trim() || 'linear';
  const done = () => el.remove();
  // A cancelled animation (the node detached elsewhere) still ends in removal.
  return el.animate({ opacity: [1, 0], scale: [1, 0.96] }, { duration, easing }).finished.then(done, done);
}
