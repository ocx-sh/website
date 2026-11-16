/**
 * The Markdown body of the glossary page: one `## Category {#category}` section per category, each holding one
 * `### Term {#id}` entry (the definition, then a `See [Page](href).` line to its learn-more target). The
 * consumer writes the frontmatter and commits the file; the term links point at those `{#id}` anchors.
 *
 * Categories come in the order of `categories` (its values are the headings), then any others by slug; terms sort by their display name inside a category. Output is deterministic, so a drift check can
 * compare it with the committed file.
 * @param {readonly import('./types.mjs').GlossaryTerm[]} terms
 * @param {{
 *   categories?: Record<string, string>,
 *   base?: string,
 *   titles?: Record<string, string>,
 * }} [options] `categories`: slug to heading (default: the slug, capitalised); `base`: the site path docs
 *   routes live under (default `/`), put before a route `learnMore`; `titles`: route (without fragment) to
 *   the page title the See line shows (default: the route's last segment, capitalised)
 * @returns {string}
 */
export function glossaryMarkdown(terms: readonly import("./types.mjs").GlossaryTerm[], { categories, base, titles }?: {
    categories?: Record<string, string>;
    base?: string;
    titles?: Record<string, string>;
}): string;
