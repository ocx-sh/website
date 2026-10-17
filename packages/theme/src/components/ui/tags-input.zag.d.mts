/**
 * The value `text` adds (a suggestion's value when it names one), or why it cannot; null for blank text.
 * @param {string} text @param {string[]} value the current tags @param {Rules} rules
 * @returns {{ value: string, reason?: Reason } | null}
 */
export function resolve(text: string, value: string[], rules: Rules): {
    value: string;
    reason?: Reason;
} | null;
/**
 * The popup rows for `query`: suggestions not added yet, filtered (best first for fuzzy), then the
 * create row when it applies.
 * @param {string} query @param {string[]} value @param {Rules} rules
 * @returns {Suggestion[]}
 */
export function optionsFor(query: string, value: string[], rules: Rules): Suggestion[];
/**
 * @param {import('@zag-js/tags-input').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 * @param {import('./zag.mjs').Spawn} spawn
 */
export function render(api: import("@zag-js/tags-input").Api, root: HTMLElement, spread: import("./zag.mjs").Spread, spawn: import("./zag.mjs").Spawn): void;
/**
 * The suggestions, read back from the SSR popup rows (value, label) so the HTML carries them once.
 * ponytail: no `meta`, the rows already show it and nothing at runtime reads it.
 * @param {HTMLElement} root
 * @returns {Suggestion[]}
 */
export function readSuggestions(root: HTMLElement): Suggestion[];
export function readDom(root: HTMLElement, update: (props: Record<string, unknown>) => void): Record<string, unknown>;
export namespace combobox {
    export { comboMachine as machine };
    export { comboConnect as connect };
}
/** @typedef {{ value: string, label: string, meta?: string | undefined }} Suggestion */
/** @typedef {import('./combobox.zag.mjs').MatchMode} MatchMode */
/** @typedef {{ suggestions: Suggestion[], allowCreate: boolean, max?: number | undefined, matchMode?: MatchMode }} Rules */
/** @typedef {'unknown' | 'duplicate' | 'max'} Reason */
/** Collection value of the "Create "<text>"" row; never a tag value (the typed text is). */
export const CREATE: "ocx:create";
export function findSuggestion(suggestions: Suggestion[], text: string): Suggestion | undefined;
export function labelOf(suggestions: Suggestion[], value: string): string;
export function canCreate(query: string, value: string[], rules: Rules): boolean;
export function toCollection(query: string, value: string[], rules: Rules): import("@zag-js/listbox").ListCollection<Suggestion>;
export function inputAttrs(tags: Record<string, unknown>, combo: Record<string, unknown> | undefined, atMax: boolean): {
    readonly: boolean;
};
export function removeLabel(label: string): string;
export type Suggestion = {
    value: string;
    label: string;
    meta?: string | undefined;
};
export type MatchMode = import("./combobox.zag.mjs").MatchMode;
export type Rules = {
    suggestions: Suggestion[];
    allowCreate: boolean;
    max?: number | undefined;
    matchMode?: MatchMode;
};
export type Reason = "unknown" | "duplicate" | "max";
export type Ctx = {
    root: HTMLElement;
    input: HTMLInputElement;
    rules: Rules & {
        delimiter: string;
        readOnly: boolean;
        disabled: boolean;
        invalid: boolean;
    };
    /**
     * latest value, set synchronously by onValueChange
     */
    values: string[];
    /**
     * latest input text
     */
    query: string;
    /**
     * the popup rows for `query` and `values`
     */
    collection: ReturnType<typeof toCollection>;
    tags?: import("@zag-js/tags-input").Api;
    combo?: import("@zag-js/combobox").Api;
    child?: import("./zag.mjs").Child;
    spread?: import("./zag.mjs").Spread;
    started: boolean;
    atMax: boolean;
    /**
     * removed chips, reused: spread holds every element it touched until stop
     */
    pool: HTMLElement[];
};
import { machine as comboMachine } from '@zag-js/combobox';
import { connect as comboConnect } from '@zag-js/combobox';
import { connect } from '@zag-js/tags-input';
import { machine } from '@zag-js/tags-input';
export { connect, machine };
