/**
 * Problems in glossary data, one readable line each; an empty array means the data is sound.
 * Checks the row shape, unique ids, no form (variant, avoid or except phrase) claimed twice, definitions of at
 * most 25 words and `learnMore` in the route or URL form.
 * @param {unknown} terms
 * @returns {string[]}
 */
export function validate(terms: unknown): string[];
