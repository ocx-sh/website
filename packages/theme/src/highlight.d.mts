/**
 * `code` as HTML: one span per run of tokens that share a colour, the base colour bare. An unknown `lang`
 * throws, so a typo fails the build instead of shipping plain text.
 * @param {string} code
 * @param {string} lang Shiki language id or alias, e.g. 'sh', 'powershell', 'nushell', 'fish', 'elvish'
 * @returns {Promise<string>}
 */
export function highlight(code: string, lang: string): Promise<string>;
