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
export function mount(root: HTMLElement, { load, ...rest }: MountSpec): MountHandle;
export function rendersOpen(root: Element): boolean;
/**
 * Starts a child machine a component's `render` owns (one per toast): `paint(api, spread)` runs now
 * and on every change; `stop()` undoes its spreads and stops it; the root's teardown stops the rest.
 */
export type Spawn = (machine: AnyMachine, props: Record<string, unknown>, connect: AnyConnect, paint: (api: any, spread: Spread) => void) => Child;
/**
 * What a component's `*.zag.mjs` exports.
 */
export type ZagModule = {
    machine: AnyMachine;
    connect: AnyConnect;
    /**
     * spreads each part's props via `spread`
     */
    render: (api: any, root: HTMLElement, spread: Spread, spawn: Spawn) => void;
    /**
     * machine props only the page knows: state changed natively before start, and callbacks. `update`
     * merges props into the running machine later (a filtered or appended item collection).
     */
    readDom?: (root: HTMLElement, update: (props: Record<string, unknown>) => void) => Record<string, unknown>;
};
export type MountSpec = {
    /**
     * dynamic `import()` of the component's `*.zag.mjs`
     */
    load: () => Promise<ZagModule>;
    /**
     * default `interaction`
     */
    trigger?: "interaction" | "visible" | "manual";
    /**
     * re-dispatch one early activation after start; default true
     */
    replay?: boolean;
};
export type MountHandle = {
    /**
     * begins loading (the `manual` trigger); returns `ready`
     */
    start: () => Promise<void>;
    destroy: () => void;
    /**
     * settles when the machine is live, failed, or destroyed
     */
    ready: Promise<void>;
    /**
     * the latest connected api, undefined until live
     */
    api: unknown;
};
/**
 * Machine props a wrapper may pass through (C-106): data only, never the ids Zag derives from the root.
 */
export type ZagProps<T> = Omit<{ [K in keyof T as NonNullable<T[K]> extends (...args: any[]) => any ? never : K]: T[K]; }, "id" | "ids" | "getRootNode" | "dir">;
export type AnyVanilla = import("@zag-js/vanilla").VanillaMachine<any>;
export type AnyMachine = ConstructorParameters<typeof import("@zag-js/vanilla").VanillaMachine<any>>[0];
export type AnyConnect = (service: AnyVanilla["service"], normalize: typeof import("@zag-js/vanilla").normalizeProps) => unknown;
export type Spread = (el: Element, attrs: Record<string, unknown>) => void;
export type Child = {
    update: (props: Record<string, unknown>) => void;
    stop: () => void;
};
