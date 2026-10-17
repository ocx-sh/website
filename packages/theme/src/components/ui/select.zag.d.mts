/**
 * @param {import('@zag-js/select').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/select").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(root: HTMLElement, update: (props: Record<string, unknown>) => void): Record<string, unknown>;
export function toCollection(items: SelectItem[]): ReturnType<typeof collection<SelectItem>>;
export type SelectItem = {
    value: string;
    label: string;
    meta?: string | undefined;
    icon?: string | undefined;
    disabled?: boolean | undefined;
};
import { connect } from '@zag-js/select';
import { machine } from '@zag-js/select';
import { collection } from '@zag-js/select';
export { connect, machine };
