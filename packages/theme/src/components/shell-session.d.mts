/**
 * Merge adjacent same-style token spans of every code line, and drop the wrapper of whitespace-only
 * runs (a run between two tokens of one style joins them). A line holding any other markup is left as is.
 * @param {string} html
 * @returns {string}
 */
export function slimTokens(html: string): string;
