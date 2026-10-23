/**
 * Spreads every part's live attributes (ZagModule['render']), plus the delegated host handlers.
 * @param {import('@zag-js/menu').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/menu").Api, root: HTMLElement, spread: import("./ui/zag.mjs").Spread): void;
/** Callbacks surface as DOM events (C-105); a selection copies the item's own text. @param {HTMLElement} root */
export function readDom(root: HTMLElement): {
    onOpenChange(detail: {
        open: boolean;
    }): void;
    onPointerDownOutside(event: {
        detail: {
            contextmenu: boolean;
            originalEvent: Event;
        };
        preventDefault: () => void;
    }): void;
    onSelect(detail: {
        value: string;
    }): void;
};
export { connect, machine } from "./ui/menu.zag.mjs";
