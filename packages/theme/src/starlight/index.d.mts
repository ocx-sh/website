/**
 * The file of a Starlight internal under `dist/components-internals/` (or a `../` sibling), or a build error naming the
 * supported range when it moved.
 * @param {string} rel
 */
export function starlightInternal(rel: string): string;
/**
 * @typedef {{ label: string, href: string }} Crumb
 * @typedef {{
 *   breadcrumbs?: false | { root?: Crumb | false },
 *   math?: boolean,
 *   glossary?: import('../markdown/glossary.mjs').GlossaryOptions,
 *   foldOutline?: boolean,
 * }} OcxThemeOptions
 */
/**
 * Starlight plugin: OCX tokens, base styles, overrides, code theme, search merge, Markdown widgets.
 * `breadcrumbs`: the trail above every page title (default on, no root crumb: section first);
 * `false` drops it, `{ root: { label, href } }` adds a root crumb.
 * `math`: also render `$…$` and `$$…$$` as math (```` ```math ```` fences always render). Off by
 * default: prose with two shell variables (`$HOME` and `$PATH`) would turn into a formula.
 * `glossary`: links the first usage of each glossary term in the prose of every page to the glossary page, with its
 * definition in a popover (`terms`, `page`, `exclude`, `frequency`: `GlossaryOptions`); off unless given.
 * `foldOutline`: an "On this page" outline of 10 rows or more folds each section's subsections under its title, the
 * section being read open (default on); `false` keeps every outline flat.
 * @param {OcxThemeOptions} [options]
 * @returns {import('@astrojs/starlight/types').StarlightPlugin}
 */
export default function ocxTheme({ breadcrumbs, math, glossary, foldOutline }?: OcxThemeOptions): import("@astrojs/starlight/types").StarlightPlugin;
export { withoutFragments };
export type Crumb = {
    label: string;
    href: string;
};
export type OcxThemeOptions = {
    breadcrumbs?: false | {
        root?: Crumb | false;
    };
    math?: boolean;
    glossary?: import("../markdown/glossary.mjs").GlossaryOptions;
    foldOutline?: boolean;
};
export type EcOptions = import("@astrojs/starlight/expressive-code").StarlightExpressiveCodeOptions;
export type Output = {
    codeSplitting?: unknown;
    manualChunks?: unknown;
} | unknown[] | undefined;
import { withoutFragments } from './sitemap-filter.mjs';
