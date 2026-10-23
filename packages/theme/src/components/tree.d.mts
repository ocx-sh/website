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
export function iconsFor(name: string, isDir: boolean, icon?: string, openIcon?: string): [closed: string, open: string];
/**
 * Clears the selection of `tree`.
 * @param {Element} tree
 * @returns {void}
 */
export function clear(tree: Element): void;
/**
 * Single selection per tree (ocx FileTree.vue `ft-select`): mark `row` selected
 * (`data-selected`, `aria-current`) and clear any other selected row in `tree`; selecting the
 * already-selected row clears it.
 * @param {Element} tree the `.ocx-tree` root
 * @param {Element} row a `.ocx-tree__row` inside `tree`
 * @returns {void}
 */
export function select(tree: Element, row: Element): void;
/**
 * The one disclosure chevron of both trees: the registry's `chevron-right`, drawn in currentColor
 * at the `--ocx-icon-stroke` weight; CSS rotates it when open. Reads the client glyph module
 * (pure data), and is `#__PURE__`, so Tree.astro's client script, which imports `select` from
 * here, tree-shakes it out of its bundle.
 */
export const CHEVRON: string;
export function isSelectable(tree: Element, row: Element): boolean;
