/**
 * The depth-0 `<div>` openings `match` accepts in `html` (nested divs belong to their own
 * component), as indices into its tokens, plus the depth-0 tokens outside every accepted div.
 * @param {string} html
 * @param {(tag: string) => boolean} match tested on each depth-0 `<div …>` opening tag
 * @returns {{ tokens: string[], at: number[], rest: string[] }}
 */
export function topLevel(html: string, match: (tag: string) => boolean): {
    tokens: string[];
    at: number[];
    rest: string[];
};
/**
 * The top-level `<TabItem>` panels (`<div data-ocx-tab>`) in the rendered `<Tabs>` slot (C-150):
 * their labels and icons, and the slot HTML with each panel's opening tag replaced by `attrs(i)`.
 * @param {string} html
 * @returns {{ items: { label: string, icon?: string }[], html: (attrs: (i: number) => Record<string, string | true>) => string }}
 */
export function tabPanels(html: string): {
    items: {
        label: string;
        icon?: string;
    }[];
    html: (attrs: (i: number) => Record<string, string | true>) => string;
};
/**
 * Wraps each top-level bare `<table>` (what markdown emits; classed tables are
 * a component's own) in {@link tableWrap}, named after the closest preceding
 * heading and numbered when a name repeats: every region landmark on a page is
 * unique (axe landmark-unique). Already wrapped tables are left alone.
 * @param {string} html
 * @returns {string}
 */
export function wrapTables(html: string): string;
/**
 * Splits every `<link rel="stylesheet">` out of the content, for the caller to
 * place ahead of the content wrapper. Expressive
 * Code emits its stylesheet link inside the first code block; when that block
 * sits in a tab panel, Chrome paints the tablist unframed (the rest of the
 * content waits for the sheet), then snaps the frame in once it loads. Ahead of
 * the content, the content paints once, already styled; outside the wrapper, no
 * `:first-child` or sibling-margin rule sees the links.
 * @param {string} html
 * @returns {{ links: string, rest: string }}
 */
export function splitStylesheets(html: string): {
    links: string;
    rest: string;
};
export function tableWrap(label: string): string;
