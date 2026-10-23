/**
 * @typedef {{ label: string, href: string }} Crumb
 * @typedef {{
 *   breadcrumbs?: false | { root?: Crumb | false },
 *   math?: boolean,
 * }} OcxThemeOptions
 */
/**
 * Starlight plugin: OCX tokens, base styles, overrides, code theme, search merge, Markdown widgets.
 * `breadcrumbs`: the trail above every page title (default on, no root crumb: section first);
 * `false` drops it, `{ root: { label, href } }` adds a root crumb.
 * `math`: also render `$…$` and `$$…$$` as math (```` ```math ```` fences always render). Off by
 * default: prose with two shell variables (`$HOME` and `$PATH`) would turn into a formula.
 * @param {OcxThemeOptions} [options]
 * @returns {import('@astrojs/starlight/types').StarlightPlugin}
 */
export default function ocxTheme({ breadcrumbs, math }?: OcxThemeOptions): import("@astrojs/starlight/types").StarlightPlugin;
export type Crumb = {
    label: string;
    href: string;
};
export type OcxThemeOptions = {
    breadcrumbs?: false | {
        root?: Crumb | false;
    };
    math?: boolean;
};
export type EcOptions = import("@astrojs/starlight/expressive-code").StarlightExpressiveCodeOptions;
export type Output = {
    codeSplitting?: unknown;
    manualChunks?: unknown;
} | unknown[] | undefined;
