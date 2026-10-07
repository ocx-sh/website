// Zag glue, trigger layer (D-Z17, C-104): the only glue a page loads before input (C-113). Each
// Zag-backed component has one `*.zag.mjs` (machine, connect, render, optional readDom) that its
// wrapper loads lazily through `mount`, together with zag-runtime.mjs, the half that imports
// @zag-js/vanilla (and holds `ssrApi`, `ssrAttrs`, `emit`). Runtime imports only: none from vanilla,
// and none from this file in a lazy module, or the bundler merges vanilla or the machines' shared
// deps into this every-page chunk.
// ponytail: no teardown on navigation, pages unload wholesale (Starlight 0.42 has no view
// transitions, D-Z16); add an `astro:before-swap` listener calling destroy() when a ClientRouter is enabled.
import { mount as lazyMount } from './lazy.mjs';
/** @typedef {import('@zag-js/vanilla').VanillaMachine<any>} AnyVanilla */
/** @typedef {ConstructorParameters<typeof import('@zag-js/vanilla').VanillaMachine<any>>[0]} AnyMachine */
/** @typedef {(service: AnyVanilla['service'], normalize: typeof import('@zag-js/vanilla').normalizeProps) => unknown} AnyConnect */
/** @typedef {(el: Element, attrs: Record<string, unknown>) => void} Spread */
/** @typedef {{ update: (props: Record<string, unknown>) => void, stop: () => void }} Child */
/**
 * True when `root`'s OWN content part is rendered unhidden. A nested component's content (a List
 * inside a closed Dialog) belongs to another `data-zag-root` and must not count.
 * @param {Element} root
 */
export const rendersOpen = (root) =>
  [...root.querySelectorAll('[data-part="content"]:not([hidden])')].some((c) => c.closest('[data-zag-root]') === root);

/**
 * Starts a child machine a component's `render` owns (one per toast): `paint(api, spread)` runs now
 * and on every change; `stop()` undoes its spreads and stops it; the root's teardown stops the rest.
 * @typedef {(machine: AnyMachine, props: Record<string, unknown>, connect: AnyConnect, paint: (api: any, spread: Spread) => void) => Child} Spawn
 */

/**
 * What a component's `*.zag.mjs` exports.
 * @typedef {object} ZagModule
 * @property {AnyMachine} machine
 * @property {AnyConnect} connect
 * @property {(api: any, root: HTMLElement, spread: Spread, spawn: Spawn) => void} render spreads each part's props via `spread`
 * @property {(root: HTMLElement, update: (props: Record<string, unknown>) => void) => Record<string, unknown>} [readDom]
 *   machine props only the page knows: state changed natively before start, and callbacks. `update`
 *   merges props into the running machine later (a filtered or appended item collection).
 */

/**
 * @typedef {object} MountSpec
 * @property {() => Promise<ZagModule>} load dynamic `import()` of the component's `*.zag.mjs`
 * @property {'interaction' | 'visible' | 'manual'} [trigger] default `interaction`
 * @property {boolean} [replay] re-dispatch one early activation after start; default true
 */

/**
 * @typedef {object} MountHandle
 * @property {() => Promise<void>} start begins loading (the `manual` trigger); returns `ready`
 * @property {() => void} destroy
 * @property {Promise<void>} ready settles when the machine is live, failed, or destroyed
 * @property {unknown} api the latest connected api, undefined until live
 */

/**
 * Machine props a wrapper may pass through (C-106): data only, never the ids Zag derives from the root.
 * @template T
 * @typedef {Omit<{ [K in keyof T as NonNullable<T[K]> extends (...args: any[]) => any ? never : K]: T[K] }, 'id' | 'ids' | 'getRootNode' | 'dir'>} ZagProps
 */

/**
 * Lazily starts a component's machine on `root` (C-104): the generic trigger layer (lazy.mjs) with
 * `load` resolving the runtime's `run` and the component's `*.zag.mjs`. Never throws.
 * @param {HTMLElement} root element carrying `data-zag-root`, `data-zag-id`, `data-zag-props`
 * @param {MountSpec} spec
 * @returns {MountHandle}
 */
export function mount(root, { load, ...rest }) {
  return lazyMount(root, {
    ...rest,
    // Only `run`: a kept namespace would ship the runtime's SSR half (ssrApi, ssrAttrs) to every page.
    load: () =>
      Promise.all([import('./zag-runtime.mjs').then((m) => m.run), load()]).then(([run, mod]) => ({
        start: (el) => run(el, mod, parseProps(el.dataset.zagProps)),
      })),
  });
}

/** @param {string | undefined} json `data-zag-props`, written by our SSR @returns {Record<string, unknown>} */
function parseProps(json) {
  /** @type {unknown} */
  const value = JSON.parse(json ?? '{}');
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('data-zag-props is not an object');
  return /** @type {Record<string, unknown>} */ (value);
}
