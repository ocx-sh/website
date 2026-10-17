/**
 * Every part's attributes, shared by SSR and `render` so the first paint is final (C-130a).
 * The content is always named by its title: Zag only links the title once it has seen it live.
 * @param {import('@zag-js/dialog').Api} api
 * @returns {Record<'trigger' | 'backdrop' | 'positioner' | 'content' | 'title' | 'description' | 'closeTrigger', Record<string, unknown>>}
 */
export function parts(api: import("@zag-js/dialog").Api): Record<"trigger" | "backdrop" | "positioner" | "content" | "title" | "description" | "closeTrigger", Record<string, unknown>>;
/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/dialog').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/dialog").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(root: HTMLElement): {
    onOpenChange: ({ open }: {
        open: boolean;
    }) => void;
};
import { connect } from '@zag-js/dialog';
import { machine } from '@zag-js/dialog';
export { connect, machine };
