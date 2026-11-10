/**
 * @param {string} src
 * @param {Document} doc
 * @param {boolean} html a fragment inserted as markup: same origin only
 * @returns {Promise<string>}
 */
export function load(src: string, doc: Document, html: boolean): Promise<string>;
/**
 * Drops a kept result, for a caller that found the text unusable: Retry must fetch again, not read the same text.
 * @param {string} src
 * @param {Document} doc
 */
export function forget(src: string, doc: Document): void;
