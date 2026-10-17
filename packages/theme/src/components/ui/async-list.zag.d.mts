/**
 * @param {import('@zag-js/listbox').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 * @param {import('./zag.mjs').Spawn} spawn
 */
export function render(api: import("@zag-js/listbox").Api, root: HTMLElement, spread: import("./zag.mjs").Spread, spawn: import("./zag.mjs").Spawn): void;
/**
 * The listbox's props, and `update` kept for the loaded collection.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} update
 */
export function readDom(root: HTMLElement, update: (props: Record<string, unknown>) => void): {
    collection: import("@zag-js/listbox").ListCollection<import("./listbox.zag.mjs").ListItem>;
    onValueChange: ({ value }: {
        value: string[];
    }) => void;
};
/** @typedef {import('./listbox.zag.mjs').ListItem} ListItem */
/** @typedef {import('@zag-js/async-list').Api<ListItem, string>} AsyncApi */
/**
 * `ocx:list:fetch` detail. Call `respond` synchronously in the listener (respondWith-style) with the
 * page or a promise of it: resolve → rows, reject → the error state. No synchronous `respond`, or
 * an answer without `items: [{ value, label }]`, is the error state too. The first answer wins.
 * @typedef {object} ListFetchDetail
 * @property {string | null} cursor null for the first page
 * @property {string} filter
 * @property {{ column: string, direction: 'ascending' | 'descending' } | null} sort
 * @property {AbortSignal | undefined} signal aborted by a newer load and by destroy
 * @property {(answer: ListPage | Promise<ListPage>) => void} respond
 */
/** @typedef {{ items: ListItem[], cursor?: string | undefined }} ListPage */
/** `ocx:list:filter` detail. @typedef {{ text: string }} ListFilterDetail */
/** `ocx:list:sort` detail. @typedef {{ column: string, direction?: 'ascending' | 'descending' }} ListSortDetail */
/** @type {typeof asyncBase} */
export const asyncMachine: typeof asyncBase;
export type ListItem = import("./listbox.zag.mjs").ListItem;
export type AsyncApi = import("@zag-js/async-list").Api<ListItem, string>;
/**
 * `ocx:list:fetch` detail. Call `respond` synchronously in the listener (respondWith-style) with the
 * page or a promise of it: resolve → rows, reject → the error state. No synchronous `respond`, or
 * an answer without `items: [{ value, label }]`, is the error state too. The first answer wins.
 */
export type ListFetchDetail = {
    /**
     * null for the first page
     */
    cursor: string | null;
    filter: string;
    sort: {
        column: string;
        direction: "ascending" | "descending";
    } | null;
    /**
     * aborted by a newer load and by destroy
     */
    signal: AbortSignal | undefined;
    respond: (answer: ListPage | Promise<ListPage>) => void;
};
export type ListPage = {
    items: ListItem[];
    cursor?: string | undefined;
};
/**
 * `ocx:list:filter` detail.
 */
export type ListFilterDetail = {
    text: string;
};
/**
 * `ocx:list:sort` detail.
 */
export type ListSortDetail = {
    column: string;
    direction?: "ascending" | "descending";
};
export type Session = {
    api: AsyncApi | undefined;
    items: ListItem[];
    loading: boolean;
};
import { machine as asyncBase } from '@zag-js/async-list';
export { connect, machine } from "./listbox.zag.mjs";
