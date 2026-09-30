// Shared core of the native `Tree` and the Zag `TreeView`: icons, the chevron, and the native
// tree's single selection. Server and client import it; everything here is tiny and pure.

import { ICONS } from '../icons/icons.generated.mjs';

/** Default icons by exact name (ocx FileTreeNode.vue DEFAULT_ICONS). */
const DEFAULT_ICONS = /** @type {Record<string, string>} */ ({
  'metadata.json': '📋',
  'manifest.json': '📋',
  'bin/': '⚙️',
  'lib/': '📚',
  'share/': '📁',
  'content/': '📂',
  'entrypoints/': '🚀',
});

/**
 * A node's closed and open icon. The open icon differs only when it is related: an explicit
 * `openIcon`, or 📁 → 📂 for a plain directory. An explicit or table icon stays put; the chevron
 * shows the state.
 * @param {string} name
 * @param {boolean} isDir
 * @param {string} [icon]
 * @param {string} [openIcon]
 * @returns {[closed: string, open: string]}
 */
export function iconsFor(name, isDir, icon, openIcon) {
  const named = DEFAULT_ICONS[name];
  const closed = icon ?? named ?? (isDir ? '📁' : '📄');
  return [closed, openIcon ?? (icon == null && named == null && isDir ? '📂' : closed)];
}

/**
 * The one disclosure chevron of both trees: the registry's `chevron-right`, drawn in currentColor
 * at the `--ocx-icon-stroke` weight; CSS rotates it when open. Reads `icons.generated.mjs` (pure
 * data) rather than `icons.mjs`, and is `#__PURE__`, so Tree.astro's client script, which imports
 * `select` from here, tree-shakes the registry out of its bundle.
 */
export const CHEVRON = /*#__PURE__*/ (() => {
  const { viewBox, body, stroke } = ICONS['chevron-right'];
  return `<svg viewBox="${viewBox}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" style="stroke-width:var(--ocx-icon-stroke)" aria-hidden="true" focusable="false">${body.replace('<path ', '<path vector-effect="non-scaling-stroke" ')}</svg>`;
})();

/**
 * Whether `row` takes part in selection: its own `data-selectable`, else the tree's (opt-in).
 * @param {Element} tree the `.ocx-tree` root
 * @param {Element} row a `.ocx-tree__row` inside `tree`
 * @returns {boolean}
 */
export const isSelectable = (tree, row) =>
  (row.getAttribute('data-selectable') ?? tree.getAttribute('data-selectable')) === 'true';

/**
 * Clears the selection of `tree`.
 * @param {Element} tree
 * @returns {void}
 */
export function clear(tree) {
  for (const r of tree.querySelectorAll('[data-selected]')) {
    r.removeAttribute('data-selected');
    r.removeAttribute('aria-current');
  }
}

/**
 * Single selection per tree (ocx FileTree.vue `ft-select`): mark `row` selected
 * (`data-selected`, `aria-current`) and clear any other selected row in `tree`; selecting the
 * already-selected row clears it.
 * @param {Element} tree the `.ocx-tree` root
 * @param {Element} row a `.ocx-tree__row` inside `tree`
 * @returns {void}
 */
export function select(tree, row) {
  const was = row.hasAttribute('data-selected');
  clear(tree);
  if (was) return;
  row.setAttribute('data-selected', '');
  row.setAttribute('aria-current', 'true');
}
