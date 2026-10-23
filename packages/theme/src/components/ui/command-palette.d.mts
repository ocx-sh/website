/**
 * Wires the palette in `root` (a `CommandPalette`). Returns `destroy`.
 * @param {HTMLElement} root
 * @param {PaletteOptions} options
 */
export function mountCommandPalette(root: HTMLElement, options: PaletteOptions): {
    destroy(): void;
};
/**
 * One result row, a real link.
 */
export type PaletteItem = {
    /**
     * http(s) or relative; any other scheme is dropped
     */
    href: string;
    label: string;
    /**
     * muted second line
     */
    description?: string;
};
/**
 * One titled group of rows ("Packages", "Docs"); an empty group is not drawn.
 */
export type PaletteGroup = {
    label: string;
    items: readonly PaletteItem[];
};
/**
 * What the page's lazily loaded module provides. `search` runs per query (the signal aborts when a
 * newer query or a close supersedes it); `warm` runs on every open, to fetch data ahead of the first query.
 */
export type PaletteSource = {
    search: (query: string, signal: AbortSignal) => readonly PaletteGroup[] | Promise<readonly PaletteGroup[]>;
    warm?: () => unknown;
};
export type PaletteOptions = {
    /**
     * dynamic `import()` of the module holding the search; loaded on first open, retried after a failure
     */
    source: () => Promise<PaletteSource>;
    /**
     * open on "/" (default true); a function is asked per keypress, so a page that claims "/" for itself answers false
     */
    slash?: boolean | (() => boolean);
};
