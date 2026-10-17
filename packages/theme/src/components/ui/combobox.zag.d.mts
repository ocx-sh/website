/**
 * `label` split into render segments around its match(es) of `query` under `mode`; one plain
 * segment, unmarked, when there is none.
 * @param {string} label @param {string} [query] @param {MatchMode} [mode]
 * @returns {{ text: string, mark: boolean }[]}
 */
export function segmentsOf(label: string, query?: string, mode?: MatchMode): {
    text: string;
    mark: boolean;
}[];
/**
 * @param {import('@zag-js/combobox').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/combobox").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(root: HTMLElement, update: (props: Record<string, unknown>) => void): Record<string, unknown>;
export function toCollection(items: ComboboxItem[], query?: string, mode?: MatchMode): ReturnType<typeof collection<ComboboxItem>>;
export function queryOf(items: ComboboxItem[], text: string): string;
export type ComboboxItem = {
    value: string;
    label: string;
};
export type MatchMode = "fuzzy" | "contains" | "startsWith";
import { connect } from '@zag-js/combobox';
import { machine } from '@zag-js/combobox';
import { collection } from '@zag-js/combobox';
export { connect, machine };
