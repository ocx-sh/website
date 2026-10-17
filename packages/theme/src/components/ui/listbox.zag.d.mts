/**
 * Spreads the api onto the SSR rows (and any a subclass appended), found by `data-value`.
 * @param {import('@zag-js/listbox').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/listbox").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
/**
 * The collection rebuilt from the SSR rows (no JSON copy in the page), and the change callback.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} _update
 */
export function readDom(root: HTMLElement, _update: (props: Record<string, unknown>) => void): {
    collection: import("@zag-js/listbox").ListCollection<ListItem>;
    onValueChange: ({ value }: {
        value: string[];
    }) => void;
};
export function toCollection(items: ListItem[], columns?: number): import("@zag-js/listbox").ListCollection<ListItem>;
/**
 * One row of `List`'s `items`.
 */
export type ListItem = {
    /**
     * unique in the list
     */
    value: string;
    /**
     * the row text, and what typeahead matches
     */
    label: string;
    disabled?: boolean;
    /**
     * rows sharing a group render together under its label
     */
    group?: string;
    /**
     * second line of a card row
     */
    description?: string;
    /**
     * right-aligned muted detail
     */
    meta?: string;
};
import { connect } from '@zag-js/listbox';
import { machine } from '@zag-js/listbox';
export { connect, machine };
