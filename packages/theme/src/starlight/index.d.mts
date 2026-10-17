/**
 * @typedef {{ label: string, href: string }} Crumb
 * @typedef {{
 *   breadcrumbs?: false | { root?: Crumb | false },
 * }} OcxThemeOptions
 */
/**
 * Starlight plugin: OCX tokens, base styles, overrides, code theme, search merge.
 * `breadcrumbs`: the trail above every page title (default on, no root crumb: section first);
 * `false` drops it, `{ root: { label, href } }` adds a root crumb.
 * @param {OcxThemeOptions} [options]
 * @returns {import('@astrojs/starlight/types').StarlightPlugin}
 */
export default function ocxTheme({ breadcrumbs }?: OcxThemeOptions): import("@astrojs/starlight/types").StarlightPlugin;
export type Crumb = {
    label: string;
    href: string;
};
export type OcxThemeOptions = {
    breadcrumbs?: false | {
        root?: Crumb | false;
    };
};
export type EcOptions = import("@astrojs/starlight/expressive-code").StarlightExpressiveCodeOptions;
export type Output = {
    codeSplitting?: unknown;
    manualChunks?: unknown;
} | unknown[] | undefined;
