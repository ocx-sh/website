/**
 * Every part's attributes, shared by SSR and `render` (C-130a).
 * @param {import('@zag-js/tooltip').Api} api
 * @returns {Record<'trigger' | 'positioner' | 'content', Record<string, unknown>>}
 */
export function parts(api: import("@zag-js/tooltip").Api): Record<"trigger" | "positioner" | "content", Record<string, unknown>>;
/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/tooltip').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/tooltip").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(root: HTMLElement): {
    onOpenChange: ({ open }: {
        open: boolean;
    }) => void;
};
import { connect } from '@zag-js/tooltip';
import { machine } from '@zag-js/tooltip';
export { connect, machine };
