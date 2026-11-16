/**
 * A finder over the glossary: every term form in a string, longest first, with the `except` phrases
 * consuming their text so `package manager` holds no `package`.
 *
 * Only forms listed in `variants` match (no stemming); the canonical `term` is display text. A form with an
 * uppercase letter (`OCI`, `Sigstore`) matches exactly, an all-lowercase one in any case; the hit keeps the
 * source text.
 *
 * `match: 'avoid'` finds each term's banned synonyms instead, for a lint over source prose; the hit's `id` is
 * the term the form should be replaced by.
 * @param {readonly import('./types.mjs').GlossaryTerm[]} terms
 * @param {{ match?: 'variants' | 'avoid' }} [options]
 * @returns {(text: string) => import('./types.mjs').GlossaryHit[]}
 */
export function matcher(terms: readonly import("./types.mjs").GlossaryTerm[], { match }?: {
    match?: "variants" | "avoid";
}): (text: string) => import("./types.mjs").GlossaryHit[];
