/**
 * @typedef {object} PagefindContext
 * @property {string} base the site base (`import.meta.env.BASE_URL`)
 * @property {Record<string, string>} translations Starlight's Pagefind translations
 * @property {boolean} stripTrailingSlash Starlight's `trailingSlash: 'never'` handling
 */
/** @typedef {{ url: string, sub_results: { url: string }[] }} PagefindResult */
/**
 * The PagefindUI options Starlight 0.42.4's `Search.astro` builds, unchanged.
 * @param {Record<string, unknown>} config Starlight's `pagefind` config (`virtual:starlight/pagefind-config`)
 * @param {PagefindContext} context
 * @returns {Record<string, unknown>}
 */
export function pagefindOptions(config: Record<string, unknown>, { base, translations, stripTrailingSlash }: PagefindContext): Record<string, unknown>;
/**
 * Spreads the live dialog parts onto the SSR markup.
 * @param {import('@zag-js/dialog').Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api: import("@zag-js/dialog").Api, root: HTMLElement, spread: (el: Element, attrs: Record<string, unknown>) => void): void;
/**
 * Machine props only the DOM knows: the initial focus target and the open-change callback
 * (body hook, first-open Pagefind load, `ocx:search:change`).
 * @param {HTMLElement} root
 * @returns {Partial<import('@zag-js/dialog').Props>}
 */
export function readDom(root: HTMLElement): Partial<import("@zag-js/dialog").Props>;
export type PagefindContext = {
    /**
     * the site base (`import.meta.env.BASE_URL`)
     */
    base: string;
    /**
     * Starlight's Pagefind translations
     */
    translations: Record<string, string>;
    /**
     * Starlight's `trailingSlash: 'never'` handling
     */
    stripTrailingSlash: boolean;
};
export type PagefindResult = {
    url: string;
    sub_results: {
        url: string;
    }[];
};
import { connect } from '@zag-js/dialog';
import { machine } from '@zag-js/dialog';
export { connect, machine };
