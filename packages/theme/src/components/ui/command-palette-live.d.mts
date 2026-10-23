/**
 * @typedef {object} Live
 * @property {(open: boolean | undefined, opener: Element | null) => Promise<boolean>} setOpen `open` omitted: toggle; false once the start has failed
 * @property {() => void} destroy
 */
/**
 * Starts the palette in `root`.
 * @param {HTMLElement} root
 * @param {import('./command-palette.mjs').PaletteOptions} options
 * @returns {Live}
 */
export function attach(root: HTMLElement, options: import("./command-palette.mjs").PaletteOptions): Live;
export type Live = {
    /**
     * `open` omitted: toggle; false once the start has failed
     */
    setOpen: (open: boolean | undefined, opener: Element | null) => Promise<boolean>;
    destroy: () => void;
};
