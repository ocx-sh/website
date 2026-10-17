/**
 * Every part's attributes, shared by SSR and `render` (C-130a). The pane never gets `hidden` (the
 * popover shows and hides it, and at ≥ 50em it is the static column) and is a dialog, named by the
 * toggle, only while open.
 * @param {import('@zag-js/drawer').Api} api
 * @returns {Record<'trigger' | 'backdrop' | 'content', Record<string, unknown>>}
 */
export function parts(api: import("@zag-js/drawer").Api): Record<"trigger" | "backdrop" | "content", Record<string, unknown>>;
/**
 * Attributes SSR keeps of a part: what JS off and first paint read; the machine spreads the rest on
 * start. Every page pays for these bytes (htmlGz). The trigger's expanded state is left to its
 * `popovertarget` invoker until the machine owns it (as the header's, C-192).
 * @param {'trigger' | 'backdrop'} part
 * @param {Record<string, unknown>} attrs
 * @returns {Record<string, unknown>}
 */
export function lean(part: "trigger" | "backdrop", attrs: Record<string, unknown>): Record<string, unknown>;
/**
 * Spreads the live parts and shows or hides the pane with the machine's state (ZagModule['render']).
 * @param {import('@zag-js/drawer').Api} api
 * @param {HTMLElement} root
 * @param {import('../components/ui/zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/drawer").Api, root: HTMLElement, spread: import("../components/ui/zag.mjs").Spread): void;
/**
 * Machine props only the page knows (ZagModule['readDom']): the pane's id, the guards that keep a
 * native popover opened over the pane (the ecosystem menu) usable, focus return, and the change
 * callback `ocx:mobile-menu:change {open}` (C-105).
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root: HTMLElement): Record<string, unknown>;
/** Starlight's pane (PageFrame): the drawer's content, id kept (D-Z4). */
export const PANE: "starlight__sidebar";
import { connect } from '../components/ui/drawer.zag.mjs';
import { machine } from '../components/ui/drawer.zag.mjs';
export { connect, machine };
