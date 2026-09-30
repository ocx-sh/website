// Interactive tree on Zag `tree-view` (C-200, APG tree). The docs `Tree` stays native <details>.
import { collection, connect, machine } from '@zag-js/tree-view';
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine };

/**
 * One node of `TreeView`'s `items`. A node with non-empty `children` is a branch.
 * @typedef {object} TreeViewItem
 * @property {string} value unique in the tree
 * @property {string} label
 * @property {TreeViewItem[]} [children]
 * @property {boolean} [disabled]
 * @property {string} [icon] replaces the default icon (tree.mjs `iconsFor`, as in `Tree`)
 * @property {string} [openIcon] icon of an open branch
 * @property {string} [description] muted text after the label
 * @property {boolean} [selectable] overrides the tree's `selectable`
 */

/** @typedef {import('@zag-js/tree-view').Api} Api */

/**
 * The Zag collection over `items`, shared by SSR and the client so both see the same tree.
 * @param {TreeViewItem[]} items
 * @returns {NonNullable<import('@zag-js/tree-view').Props['collection']>}
 */
export const toCollection = (items) =>
  collection({
    rootNode: { value: '', label: '', children: items },
    nodeToValue: (/** @type {TreeViewItem} */ node) => node.value,
    nodeToString: (/** @type {TreeViewItem} */ node) => node.label,
  });

/**
 * Spreads the api onto the SSR markup; every node element carries its `data-path` (index path).
 * @param {Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  const label = root.querySelector('[data-part="label"]');
  const tree = root.querySelector('[data-part="tree"]');
  if (label) spread(label, api.getLabelProps());
  if (tree) spread(tree, api.getTreeProps());
  for (const el of root.querySelectorAll('[data-part="branch"], [data-part="item"]')) {
    const indexPath = (el.getAttribute('data-path') ?? '').split('/').map(Number);
    /** @type {unknown} Zag's TreeNode is `any` */
    const node = api.collection.at(indexPath);
    const props = { node, indexPath };
    const [first, content] = el.children;
    if (el.getAttribute('data-part') === 'item') {
      spread(el, api.getItemProps(props));
      if (first) spread(first, api.getItemTextProps(props));
      continue;
    }
    spread(el, api.getBranchProps(props));
    if (first) spread(first, api.getBranchControlProps(props));
    const [indicator, text] = first?.children ?? [];
    if (indicator) spread(indicator, api.getBranchIndicatorProps(props));
    if (text) spread(text, api.getBranchTextProps(props));
    if (content) spread(content, api.getBranchContentProps(props));
  }
}

/**
 * The nodes under `parent` as SSR wrote them (the machine's data only; icons stay in the markup).
 * `selectable` collects the values of the nodes that take selection.
 * @param {Element} parent
 * @param {boolean} all the tree's `selectable`
 * @param {Set<string>} selectable
 * @returns {TreeViewItem[]}
 */
function readNodes(parent, all, selectable) {
  return [...parent.children].flatMap((el) => {
    const part = el.getAttribute('data-part');
    if (part !== 'branch' && part !== 'item') return [];
    const [first, content] = el.children;
    const name = first?.querySelector('.ocx-tree-view__name');
    /** @type {TreeViewItem} */
    const node = { value: el.getAttribute('data-value') ?? '', label: name?.textContent ?? '' };
    if ((name?.getAttribute('data-selectable') ?? String(all)) === 'true') selectable.add(node.value);
    if (el.hasAttribute('data-disabled') || first?.hasAttribute('data-disabled')) node.disabled = true;
    if (part === 'branch') node.children = content ? readNodes(content, all, selectable) : [];
    return [node];
  });
}

/**
 * The collection rebuilt from the SSR tree (no JSON copy in the page), and this root's callbacks.
 * Selection is controlled (TreeView.astro): a click on a non-selectable node keeps the selection;
 * Escape on the tree, or a pointerdown outside it (owner finding 2026-09-28), clears it.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} update
 * @returns {Partial<import('@zag-js/tree-view').Props>}
 */
export function readDom(root, update) {
  const tree = root.querySelector('[data-part="tree"]');
  /** @type {Set<string>} */
  const selectable = new Set();
  const items = tree ? readNodes(tree, root.getAttribute('data-selectable') === 'true', selectable) : [];
  /** @type {unknown} */
  const parsed = JSON.parse(root.dataset['zagProps'] || '{}');
  const own = /** @type {{ selectedValue?: string[] }} */ (parsed);
  let current = own.selectedValue ?? [];
  const set = (/** @type {string[]} */ value) => {
    current = value;
    update({ selectedValue: value });
    emit(root, 'tree-view', 'select', { value });
  };
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current.length) set([]);
  });
  // No selectable node → skip the listener (no cost for a non-selectable tree). `root.isConnected`
  // self-removes it once the root leaves the DOM; nothing else tears this root down today.
  if (selectable.size) {
    const onOutside = (/** @type {PointerEvent} */ e) => {
      if (!root.isConnected) return document.removeEventListener('pointerdown', onOutside);
      if (current.length && e.target instanceof Node && !root.contains(e.target)) set([]);
    };
    document.addEventListener('pointerdown', onOutside);
  }
  return {
    collection: toCollection(items),
    onSelectionChange: (/** @type {{ selectedValue: string[] }} */ { selectedValue }) => {
      const next = selectedValue.filter((v) => selectable.has(v));
      if (next.length || !selectedValue.length) set(next);
    },
    onExpandedChange: (/** @type {{ expandedValue: string[] }} */ { expandedValue }) =>
      emit(root, 'tree-view', 'expand', { value: expandedValue }),
  };
}
