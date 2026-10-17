/**
 * Group api plus what the Footer needs after start: `show`/`dismiss` for `ocx:toast` /
 * `ocx:toast:dismiss`, and the service the per-toast machines take as `parent`.
 * @param {toast.GroupService} service
 * @param {Parameters<typeof toast.group.connect>[1]} normalize
 * @returns {toast.GroupApi & {
 *   service: toast.GroupService,
 *   show: (detail: import('./toast.mjs').ToastDetail) => void,
 *   dismiss: (id?: string) => void,
 * }}
 */
export function connect(service: toast.GroupService, normalize: Parameters<typeof toast.group.connect>[1]): toast.GroupApi & {
    service: toast.GroupService;
    show: (detail: import("./toast.mjs").ToastDetail) => void;
    dismiss: (id?: string) => void;
};
/**
 * @param {ReturnType<typeof connect>} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 * @param {import('./ui/zag.mjs').Spawn} spawn
 */
export function render(api: ReturnType<typeof connect>, root: HTMLElement, spread: import("./ui/zag.mjs").Spread, spawn: import("./ui/zag.mjs").Spawn): void;
/** The group machine bound to this page's store (a store is not JSON, so it never crosses SSR). */
/** @type {toast.GroupMachine} */
export const machine: toast.GroupMachine;
export type Glyph = {
    viewBox: string;
    body: string;
    stroke?: number;
};
export type Item = {
    el: HTMLElement;
    child: import("./ui/zag.mjs").Child;
    last: Record<string, unknown>;
    action: toast.ActionOptions | undefined;
    progress: number | undefined;
};
export type Items = Map<string, Item>;
import * as toast from '@zag-js/toast';
