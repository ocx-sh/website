/**
 * @param {HTMLElement} root the `CommandPalette`
 * @param {() => Promise<PaletteSource>} importSource
 * @param {(open: boolean) => void} setOpen
 * @returns {{ stop: () => void }}
 */
export function startSession(root: HTMLElement, importSource: () => Promise<PaletteSource>, setOpen: (open: boolean) => void): {
    stop: () => void;
};
export type PaletteSource = import("./command-palette.mjs").PaletteSource;
export type PaletteGroup = import("./command-palette.mjs").PaletteGroup;
