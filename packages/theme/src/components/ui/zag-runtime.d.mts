/**
 * Zag part props → attributes an Astro element can spread (C-102).
 * @param {Record<string, unknown>} props
 * @returns {Record<string, string | true>}
 */
export function ssrAttrs(props: Record<string, unknown>): Record<string, string | true>;
/**
 * `connect()` of an unstarted machine: the api SSR renders from (C-103). Needs no DOM.
 * @template A
 * @param {AnyMachine} machine
 * @param {(service: AnyVanilla['service'], normalize: typeof normalizeProps) => A} connect
 * @param {Record<string, unknown>} props
 * @returns {A}
 */
export function ssrApi<A>(machine: AnyMachine, connect: (service: AnyVanilla["service"], normalize: typeof normalizeProps) => A, props: Record<string, unknown>): A;
/**
 * Starts `mod`'s machine on `root` and paints it; `stop()` undoes every spread and stops the
 * machine and its children. A throw while starting cleans up before it propagates.
 * @param {HTMLElement} root
 * @param {ZagModule} mod
 * @param {Record<string, unknown>} own machine props from `data-zag-props`
 * @returns {Session}
 */
export function run(root: HTMLElement, mod: ZagModule, own: Record<string, unknown>): Session;
/**
 * Surfaces a Zag callback as a DOM event `ocx:<scope>:<name>` (C-105).
 * @param {Element} root
 * @param {string} scope
 * @param {string} name
 * @param {unknown} detail JSON-serialisable
 */
export function emit(root: Element, scope: string, name: string, detail: unknown): void;
export type ZagModule = import("./zag.mjs").ZagModule;
export type Spread = import("./zag.mjs").Spread;
export type Spawn = import("./zag.mjs").Spawn;
export type AnyMachine = import("./zag.mjs").AnyMachine;
export type AnyVanilla = import("./zag.mjs").AnyVanilla;
export type Session = {
    readonly api: unknown;
    stop: () => void;
};
import { normalizeProps } from '@zag-js/vanilla';
