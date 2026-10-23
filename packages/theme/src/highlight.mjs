// Build-time highlighting for code outside Expressive Code frames: the frames' own Shiki grammars and
// theme (ec.mjs), so a token wears the colour it has in a code block. Server-only: a browser import would
// pull Shiki's engine and grammars into the client bundle.
import { createHighlighter } from 'shiki';
import { EXPRESSIVE_CODE } from './starlight/ec.mjs';

const { langs = [], langAlias = {} } =
  /** @type {{ langs?: import('shiki').LanguageInput[], langAlias?: Record<string, string> }} */ (
    EXPRESSIVE_CODE.shiki
  );
const theme = /** @type {import('shiki').ThemeRegistrationAny} */ (
  /** @type {unknown} */ (EXPRESSIVE_CODE.themes?.[0])
);
// The base code colour: left bare, it inherits its container's ink.
const BASE = 'var(--ocx-color-code-fg)';
/** @type {Record<string, string>} */
const ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escape = (/** @type {string} */ text) => text.replace(/[&<>]/g, (c) => ENTITY[c] ?? c);
/** @type {ReturnType<typeof createHighlighter> | undefined} */
let highlighter;

/**
 * `code` as HTML: one span per run of tokens that share a colour, the base colour bare. An unknown `lang`
 * throws, so a typo fails the build instead of shipping plain text.
 * @param {string} code
 * @param {string} lang Shiki language id or alias, e.g. 'sh', 'powershell', 'nushell', 'fish', 'elvish'
 * @returns {Promise<string>}
 */
export async function highlight(code, lang) {
  highlighter ??= createHighlighter({ themes: [theme], langs, langAlias });
  const shiki = await highlighter;
  const id = /** @type {import('shiki').BundledLanguage} */ (langAlias[lang] ?? lang);
  if (!shiki.getLoadedLanguages().includes(id)) await shiki.loadLanguage(id);
  /** @type {{ color: string, text: string }[]} */
  const runs = [];
  for (const [i, line] of shiki.codeToTokensBase(code, { lang: id, theme }).entries()) {
    if (i > 0) runs.push({ color: BASE, text: '\n' });
    for (const { color = BASE, content } of line) {
      const last = runs.at(-1);
      if (last?.color === color) last.text += content;
      else runs.push({ color, text: content });
    }
  }
  return runs
    .map(({ color, text }) => (color === BASE ? escape(text) : `<span style="color:${color}">${escape(text)}</span>`))
    .join('');
}
