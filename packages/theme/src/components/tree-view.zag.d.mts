/**
 * Spreads the api onto the SSR markup; every node element carries its `data-path` (index path).
 * @param {Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api: Api, root: HTMLElement, spread: (el: Element, attrs: Record<string, unknown>) => void): void;
/**
 * The collection rebuilt from the SSR tree (no JSON copy in the page), and this root's callbacks.
 * Selection is controlled (TreeView.astro): a click on a non-selectable node keeps the selection;
 * Escape on the tree, or a pointerdown outside it (owner finding 2026-09-28), clears it.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} update
 * @returns {Partial<import('@zag-js/tree-view').Props>}
 */
export function readDom(root: HTMLElement, update: (props: Record<string, unknown>) => void): Partial<import("@zag-js/tree-view").Props>;
export function toCollection(items: TreeViewItem[]): NonNullable<import("@zag-js/tree-view").Props["collection"]>;
/**
 * One node of `TreeView`'s `items`. A node with non-empty `children` is a branch.
 */
export type TreeViewItem = {
    /**
     * unique in the tree
     */
    value: string;
    label: string;
    children?: TreeViewItem[];
    disabled?: boolean;
    /**
     * replaces the default icon (tree.mjs `iconsFor`, as in `Tree`)
     */
    icon?: string;
    /**
     * icon of an open branch
     */
    openIcon?: string;
    /**
     * muted text after the label
     */
    description?: string;
    /**
     * overrides the tree's `selectable`
     */
    selectable?: boolean;
};
export type Api = import("@zag-js/tree-view").Api;
import { connect } from '@zag-js/tree-view';
import { machine } from '@zag-js/tree-view';
export { connect, machine };
