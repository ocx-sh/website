/**
 * Every part's attributes, shared by SSR and `render` (C-130a). The content is always named by
 * its title: Zag only links the title once it has seen it live.
 * @param {import('@zag-js/drawer').Api} api
 * @returns {Record<'trigger' | 'backdrop' | 'positioner' | 'content' | 'title' | 'description' | 'closeTrigger', Record<string, unknown>>}
 */
export function parts(api: import("@zag-js/drawer").Api): Record<"trigger" | "backdrop" | "positioner" | "content" | "title" | "description" | "closeTrigger", Record<string, unknown>>;
/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/drawer').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/drawer").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(root: HTMLElement): {
    onOpenChange: ({ open }: {
        open: boolean;
    }) => void;
};
import { connect } from '@zag-js/drawer';
import { machine } from '@zag-js/drawer';
export { connect, machine };
