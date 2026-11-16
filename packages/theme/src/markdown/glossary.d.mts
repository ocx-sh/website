/**
 * Sätteri mdast plugin: the first usage of each glossary term in a page's prose becomes
 * `<a class="ocx-term" href="<page>#<id>">text</a>`, the one element per term (frequency `page`; see
 * {@link GlossaryOptions}). Pages are not edited. Never linked: headings, link and image text, code,
 * raw HTML, directive labels (an aside's title: Starlight moves its text into an `aria-hidden` element, where a
 * link would be focusable but hidden), the props of components and the content of components other
 * than `Steps`, `Tabs`, `TabItem`, `Aside` and `details`. Matching rules: `matcher` in `../glossary/matcher.mjs`.
 * A row's `excludePages` (route prefixes, matched like `exclude`) drops that term's forms on those pages only:
 * its `except` phrases still match and every other term, longer forms containing the word included, links.
 *
 * @param {GlossaryOptions & { root: string, base: string }} options `root` is the absolute docs content root,
 *   `base` its site path (`/docs/`); a page outside the root (a story) links like any other
 * @returns {import('satteri').MdastPluginDefinition}
 */
export function glossary({ terms, root, base, page, exclude, frequency }: GlossaryOptions & {
    root: string;
    base: string;
}): import("satteri").MdastPluginDefinition;
export type GlossaryFrequency = "page" | "section" | "all";
/**
 * `terms`: the glossary rows; `page`: the glossary page's route under the docs base (`reference/glossary/`),
 * whose `{#id}` anchors the links target and which never links its own terms; `exclude`: route prefixes whose
 * pages link nothing (`changelog/`); `frequency`: which usages link, `page` (default) the first of each term
 * per page, `section` the first per `##` section (text before the first `##` is a section of its own), `all`
 * every one
 */
export type GlossaryOptions = {
    terms: readonly import("../glossary/types.mjs").GlossaryTerm[];
    page: string;
    exclude?: readonly string[];
    frequency?: GlossaryFrequency;
};
