/**
 * Merge adjacent same-style token spans of every code line, and drop the wrapper of whitespace-only
 * runs (a run between two tokens of one style joins them). A line holding any other markup is left as is.
 * @param {string} html
 * @returns {string}
 */
export function slimTokens(html: string): string;
/**
 * Marks the lines of a command that are not commands (`data-ocx-continued`, drawn without the `$` but with its
 * width, so the indent holds): the line after one ending in `\` (PowerShell: a backtick or `|`), whatever it holds;
 * in a shell or PowerShell fence also a blank or `#` comment line, a line that starts inside a quoted string a
 * line before left open, the body of a heredoc up to its terminator and, in PowerShell, a line inside a `{` or `(`
 * block an earlier line left open (its closing `}` or `)` line included). Quotes count outside `#` comments;
 * `\` escapes in sh, a backtick in PowerShell, and in sh a single quote holds no escape.
 * @param {string} block the fence up to the next session marker, as rendered HTML
 * @returns {string}
 */
export function continued(block: string): string;
