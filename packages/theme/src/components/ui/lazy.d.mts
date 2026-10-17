/**
 * Lazily starts a widget on `root` (C-104). Never throws.
 * @param {HTMLElement} root element carrying `data-zag-root`
 * @param {MountSpec} spec
 * @returns {MountHandle}
 */
export function mount(root: HTMLElement, { load, trigger, replay }: MountSpec): MountHandle;
/**
 * What `load` resolves to. `start` returns a session (kept as `api`, stopped on destroy) or nothing.
 */
export type LazyModule = {
    start: (root: HTMLElement, firstEvent?: MouseEvent | KeyboardEvent) => ({
        readonly api: unknown;
        stop: () => void;
    }) | void;
};
export type MountSpec = {
    /**
     * dynamic `import()` of the module that starts the widget
     */
    load: () => Promise<LazyModule>;
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
     * settles when the module is live, failed, or destroyed
     */
    ready: Promise<void>;
    /**
     * the latest session api, undefined until live
     */
    api: unknown;
};
