/**
 * Every part's attributes, shared by SSR and `render` (C-130a). The panel has no title part,
 * so its trigger names it.
 * @param {import('@zag-js/popover').Api} api
 * @returns {Record<'trigger' | 'positioner' | 'content', Record<string, unknown>>}
 */
export function parts(api: import("@zag-js/popover").Api): Record<"trigger" | "positioner" | "content", Record<string, unknown>>;
/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/popover').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/popover").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(root: HTMLElement): {
    onOpenChange: ({ open }: {
        open: boolean;
    }) => void;
};
import { connect } from '@zag-js/popover';
import { machine } from '@zag-js/popover';
export { connect, machine };
