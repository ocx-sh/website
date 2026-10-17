/** @typedef {{ value: string, disabled?: boolean | undefined }} Item */
/**
 * Every part's attributes, shared by SSR and `render` (C-130a). Only one of `trigger` and
 * `contextTrigger` is rendered.
 * @param {import('@zag-js/menu').Api} api
 * @param {readonly Item[]} items
 * @returns {Record<string, Record<string, unknown>>}
 */
export function parts(api: import("@zag-js/menu").Api, items: readonly Item[]): Record<string, Record<string, unknown>>;
/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/menu').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/menu").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(root: HTMLElement): {
    onSelect: ({ value }: {
        value: string;
    }) => void;
    onOpenChange: ({ open }: {
        open: boolean;
    }) => void;
};
export type Item = {
    value: string;
    disabled?: boolean | undefined;
};
import { connect } from '@zag-js/menu';
import { machine } from '@zag-js/menu';
export { connect, machine };
