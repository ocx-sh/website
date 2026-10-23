/**
 * @typedef {{
 *   features: import('satteri').Features,
 *   mdastPlugins: import('satteri').MdastPluginEntry[],
 *   hastPlugins: object[],
 * }} SatteriOptions
 */
/**
 * Adds the theme's plugins to a Sätteri processor's options, in place: replacing the processor
 * would drop the consumer's own options and every plugin Starlight already added.
 * @param {SatteriOptions} options
 * @param {{ srcDir: string, docsDir: string, base: string, math: boolean, smartypants: boolean }} site
 *   `docsDir` is the docs collection's directory, `base` its site path; `math` parses `$…$` and
 *   `$$…$$`; `smartypants` is Astro's `markdown.smartypants`.
 */
export function addMarkdownPlugins(options: SatteriOptions, site: {
    srcDir: string;
    docsDir: string;
    base: string;
    math: boolean;
    smartypants: boolean;
}): void;
export type SatteriOptions = {
    features: import("satteri").Features;
    mdastPlugins: import("satteri").MdastPluginEntry[];
    hastPlugins: object[];
};
