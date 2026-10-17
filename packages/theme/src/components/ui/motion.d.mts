/**
 * Fade and shrink `el` out on `--ocx-duration-base` / `--ocx-ease-out`, then remove it. At once when
 * the token is 0 (reduced motion zeroes it). The node is `inert` and `data-leaving` meanwhile.
 * @param {HTMLElement} el
 * @returns {Promise<void>} resolves after the node is removed
 */
export function leave(el: HTMLElement): Promise<void>;
