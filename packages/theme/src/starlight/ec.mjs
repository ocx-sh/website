// Expressive Code defaults. Code frames are Expressive Code's own markup, out of
// base.css's reach, so the same tokens are fed in through one plain theme whose
// token colours are `--ocx-color-code-*` variables: they switch per scheme, so no
// second theme and no dark-mode switch. Editor `colors` stay unset (hex only).

import elvish from './elvish.tmLanguage.mjs';

// No fontStyle anywhere: the design has no italics, comments included (owner decision 2026-09-28).
/** @type {(scope: string[], token: string) => { scope: string[], settings: { foreground: string } }} */
const rule = (scope, token) => ({
  scope,
  settings: { foreground: `var(--ocx-color-code-${token})` },
});

// Shiki's PowerShell grammar leaves `-Param` unscoped (a `-` operator plus plain text) and
// bare commands and aliases (`irm … | iex`) as plain text. This injection scopes both, so
// parameters take the flag colour as in sh and commands the command colour.
// ponytail: regex heuristics, not a parser; a word at line start or after `|` is a command.
const PWSH_KEYWORDS =
  'if|elseif|else|foreach|for|while|do|until|switch|function|filter|param|return|try|catch|finally|throw|trap|break|continue|exit|begin|process|end|class|enum|using|in|data|dynamicparam';
const PWSH_OPERATORS =
  '[ci]?(?:eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|in|notin|replace|split|join|is|isnot|as)|and|or|not|xor|band|bor|bxor|bnot|shl|shr|f';
const pwshCommands = {
  name: 'ocx-pwsh-commands',
  scopeName: 'ocx.injection.powershell',
  injectTo: ['source.powershell'],
  injectionSelector: 'L:source.powershell -string -comment',
  patterns: [
    {
      match: `(?i)(?<![\\w$.)\\]-])-{1,2}(?!(?:${PWSH_OPERATORS})\\b)[a-z][\\w]*`,
      name: 'constant.other.option.powershell',
    },
    {
      match: `(?i)(?<=^|\\|)\\s*(?!(?:${PWSH_KEYWORDS})\\b)([a-z][\\w.-]*)(?=\\s|$)`,
      captures: { 1: { name: 'support.function.powershell' } },
    },
  ],
};

/** @type {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} */
export const EXPRESSIVE_CODE = {
  // Adds grammars on top of Shiki's full bundle (never a subset): Elvish has none upstream.
  shiki: { langs: [{ ...elvish, name: 'elvish', aliases: ['elv'] }, pwshCommands] },
  themes: [
    {
      name: 'ocx',
      type: 'dark',
      // Most specific scope wins, so punctuation and plain operators are muted except
      // where they belong to a string, variable or comment. Hues: keywords, flags and
      // literals (true/null) purple, commands and functions blue, strings green,
      // numbers amber, variables and data keys the accent (tokens.css › Code).
      tokenColors: [
        rule(['source', 'text'], 'fg'),
        rule(['punctuation', 'meta.brace', 'keyword.operator'], 'punctuation'),
        rule(['comment', 'punctuation.definition.comment'], 'comment'),
        rule(
          [
            'keyword',
            'storage',
            'constant.language',
            'constant.other.option',
            'keyword.operator.comparison',
            'keyword.operator.logical',
            'keyword.operator.word',
            'keyword.operator.new',
            'keyword.operator.expression',
          ],
          'keyword',
        ),
        rule(['string', 'markup.inline.raw', 'punctuation.definition.string'], 'string'),
        rule(['constant.numeric', 'constant.character'], 'number'),
        rule(['entity.name.function', 'entity.name.command', 'support.function'], 'function'),
        rule(
          [
            'variable',
            'support.variable',
            'punctuation.definition.variable',
            'entity.name',
            'support.type',
            'meta.object-literal.key',
            'support.type.property-name',
            'punctuation.support.type.property-name',
            'entity.name.tag.yaml',
          ],
          'variable',
        ),
        rule(['markup.deleted', 'invalid'], 'deleted'),
      ],
    },
  ],
  styleOverrides: {
    borderRadius: '2px',
    borderWidth: '1px',
    borderColor: 'var(--ocx-color-border)',
    codeBackground: 'var(--ocx-color-code-bg)',
    codeForeground: 'var(--ocx-color-code-fg)',
    codeFontFamily: 'var(--ocx-font-mono)',
    codeFontSize: '0.85em',
    codeLineHeight: '1.75',
    uiFontFamily: 'var(--ocx-font-mono)',
    uiFontSize: 'var(--ocx-text-xs)',
    focusBorder: 'var(--ocx-color-focus)',
    frames: {
      shadowColor: 'transparent',
      editorTabBarBackground: 'var(--ocx-color-surface-subtle)',
      editorActiveTabBackground: 'var(--ocx-color-code-bg)',
      editorActiveTabIndicatorTopColor: 'var(--ocx-color-focus)',
      terminalTitlebarBackground: 'var(--ocx-color-surface-subtle)',
      terminalTitlebarBorderBottomColor: 'var(--ocx-color-border)',
      terminalTitlebarDotsOpacity: '0',
      terminalBackground: 'var(--ocx-color-code-bg)',
      inlineButtonBorder: 'var(--ocx-color-border)',
    },
  },
};
