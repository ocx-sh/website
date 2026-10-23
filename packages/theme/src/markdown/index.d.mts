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
/**
 * Sätteri hast plugin: a heading ending in the escaped `\{#id\}` gets that id. MDX editors parse an
 * unescaped `{#id}` as a JS expression and flag it, so `.mdx` pages write the escaped form, which Sätteri
 * leaves as text.
 * @type {import('satteri').HastPluginDefinition}
 */
export const headingIds: import("satteri").HastPluginDefinition;
export type SatteriOptions = {
    features: import("satteri").Features;
    mdastPlugins: import("satteri").MdastPluginEntry[];
    hastPlugins: object[];
};
