// Code highlighting (S-001): the ec.mjs theme's scope map reaches the code
// palette on the grammars the docs use. Rendered through Expressive Code itself
// (Starlight re-exports it), colours resolved through tokens.css (light scheme).
import { readFileSync } from 'node:fs';
import { ExpressiveCode, ExpressiveCodeTheme } from '@astrojs/starlight/expressive-code';
import { describe, expect, it, vi } from 'vitest';
import { EXPRESSIVE_CODE } from '../src/starlight/ec.mjs';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
const light = css.slice(css.indexOf("[data-theme='light'] {"), css.indexOf('}', css.indexOf("[data-theme='light'] {")));
const tokens = new Map([...light.matchAll(/(--ocx-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const resolve = (value: string): string => {
  const ref = /^var\((--ocx-[\w-]+)\)$/.exec(value);
  return ref ? resolve(tokens.get(ref[1]!) ?? value) : value;
};

const SAMPLES = {
  json: '{\n  "$schema": "https://ocx.sh/schemas/metadata/v1.json",\n  "version": 1,\n  "strict": true\n}',
  powershell: "$env:OCX_HOME = 'C:\\ocx'\nInvoke-RestMethod 'https://setup.ocx.sh/pwsh' | Invoke-Expression",
  sh: 'export OCX_HOME="$HOME/.ocx"\nocx --version  # check',
  yaml: 'jobs:\n  build:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10',
  toml: '[tools]\nnode = "ocx.sh/nodejs/node:24"\nretries = 3',
  python: 'def main(n: int = 3) -> None:\n    print(f"hi {n}")  # c',
};

const theme = EXPRESSIVE_CODE.themes?.[0];
const ec = new ExpressiveCode({
  themes: [new ExpressiveCodeTheme(theme as ConstructorParameters<typeof ExpressiveCodeTheme>[0])],
  shiki: EXPRESSIVE_CODE.shiki,
});

// Plain text, muted punctuation and comments are greys, not highlighting.
const GREYS = new Set(
  ['--ocx-color-fg', '--ocx-color-fg-muted', '--ocx-color-fg-subtle'].map((t) => resolve(`var(${t})`)),
);
GREYS.add(resolve('var(--ocx-color-code-fg)'));

describe('S-001 code highlight scope map', () => {
  it.each(Object.entries(SAMPLES))('S-001: %s yields at least 3 distinct highlight colours', async (language, code) => {
    const { renderedGroupAst } = await ec.render({ code, language });
    const vars = new Set(
      [...JSON.stringify(renderedGroupAst).matchAll(/var\((--ocx-color-code-[a-z]+)\)/g)].map((m) => m[1]!),
    );
    const colours = new Set([...vars].map((v) => resolve(`var(${v})`)).filter((c) => !GREYS.has(c)));
    expect(colours.size, [...vars].join(', ')).toBeGreaterThanOrEqual(3);
  });
});

// Track E: every box type (plain fence, titled/tab frame, terminal frame, code-group tab) renders
// through this one Expressive Code config (index.mjs mergeEc), so "the highlighter" is this single
// list. A language Shiki can't find falls back to "txt" and logs to console.error instead of
// throwing — catching that is the only way to tell "quietly unhighlighted" from "highlighted".
const REQUIRED_LANGS = [
  'sh',
  'bash',
  'zsh',
  'fish',
  'nushell',
  'elvish', // vendored grammar (ec.mjs shiki.langs): Shiki ships none
  'powershell',
  'pwsh',
  'json',
  'jsonc',
  'yaml',
  'toml',
  'ts',
  'js',
  'rust',
  'python',
  'go',
  'diff',
  'dockerfile',
  'ini',
  'xml',
  'html',
  'css',
  'sql',
];
const KNOWN_GAPS = new Set<string>();

describe('S-001 highlighter language coverage', () => {
  it('EXPRESSIVE_CODE only adds grammars, never restricts Shiki to a subset (one shared set for every box)', () => {
    expect(Object.keys((EXPRESSIVE_CODE as { shiki?: object }).shiki ?? {})).toEqual(['langs']);
  });

  it.each(REQUIRED_LANGS.filter((l) => !KNOWN_GAPS.has(l)))(
    '%s is recognised by the shared highlighter',
    async (language) => {
      const warnings: unknown[] = [];
      const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => void warnings.push(args));
      try {
        await ec.render({ code: 'x', language });
      } finally {
        spy.mockRestore();
      }
      expect(warnings, `${language}: ${JSON.stringify(warnings)}`).toHaveLength(0);
    },
  );

  it.skipIf(KNOWN_GAPS.size === 0).each([...KNOWN_GAPS])(
    '%s has no Shiki grammar (documented gap, not a config bug)',
    async (language) => {
      const warnings: unknown[] = [];
      const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => void warnings.push(args));
      try {
        await ec.render({ code: 'x', language });
      } finally {
        spy.mockRestore();
      }
      expect(warnings.length, 'Shiki now supports this language — remove it from KNOWN_GAPS').toBeGreaterThan(0);
    },
  );
});

// Owner finding "syntax highlighting flat": each role in a sample gets its own palette token.
// Walks the rendered AST for `--0:var(--ocx-color-code-X)` spans and names the X per text.
type Node = { type: string; value?: string; properties?: { style?: string }; children?: Node[] };
const roleOf = async (language: string, code: string): Promise<Map<string, string>> => {
  const roles = new Map<string, string>();
  const walk = (node: Node, token?: string): void => {
    const own = /--0:var\(--ocx-color-code-([a-z]+)\)/.exec(node.properties?.style ?? '')?.[1];
    if (node.type === 'text' && node.value?.trim() && token) roles.set(node.value.trim(), token);
    for (const child of node.children ?? []) walk(child, own ?? token);
  };
  walk((await ec.render({ code, language })).renderedGroupAst as Node);
  return roles;
};

describe('S-001 distinct colours per role', () => {
  it.each([
    [
      'json',
      '{ "name": "ocx", "retries": 3, "strict": true }',
      { '"name"': 'variable', '"ocx"': 'string', '3': 'number', true: 'keyword', ':': 'punctuation' },
    ],
    [
      'yaml',
      'runs-on: ubuntu-latest\nretries: 3\nstrict: true # c',
      { 'runs-on': 'variable', 'ubuntu-latest': 'string', '3': 'number', true: 'keyword', '# c': 'comment' },
    ],
    ['toml', 'node = "24"\nretries = 3 # c', { node: 'variable', '"24"': 'string', '3': 'number', '# c': 'comment' }],
    [
      'powershell',
      "Get-ChildItem -Path $env:HOME 'x' 3 # c\nirm https://x | iex",
      {
        'Get-ChildItem': 'function',
        '-Path': 'keyword',
        '$env:HOME': 'variable',
        "'x'": 'string',
        '3': 'number',
        '# c': 'comment',
        irm: 'function',
        iex: 'function',
      },
    ],
    [
      'sh',
      'if [ -f "$f" ]; then ocx --version; fi # c',
      { if: 'keyword', ocx: 'function', '--version': 'keyword', $f: 'variable', '# c': 'comment', '];': 'punctuation' },
    ],
    [
      'elvish',
      'var home = $E:HOME\nset-env OCX "x" # c',
      { var: 'keyword', '$E:HOME': 'variable', 'set-env': 'function', '"x"': 'string', '# c': 'comment' },
    ],
  ] as const)('S-001: %s maps each role to its own token', async (language, code, expected) => {
    const roles = await roleOf(language, code);
    for (const [text, token] of Object.entries(expected)) expect(roles.get(text), `${language} ${text}`).toBe(token);
  });

  it('comments render upright: no token is italic (the design has no italics)', async () => {
    const { renderedGroupAst } = await ec.render({ code: 'ocx --version # check', language: 'sh' });
    expect(JSON.stringify(renderedGroupAst)).not.toMatch(/font-style:\s*italic/);
    for (const tc of (theme as { tokenColors: { settings: { fontStyle?: string } }[] }).tokenColors)
      expect(tc.settings.fontStyle).toBeUndefined();
  });

  it('S-001: the role tokens resolve to distinct colours in both schemes', () => {
    const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
    const dark = new Map(
      [...block(":root[data-theme='dark'] {").matchAll(/(--ocx-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
        m[1]!,
        m[2]!.trim(),
      ]),
    );
    const roles = ['comment', 'punctuation', 'keyword', 'string', 'number', 'function', 'variable'];
    for (const scheme of [tokens, new Map([...tokens, ...dark])]) {
      const res = (v: string): string => {
        const ref = /^var\((--ocx-[\w-]+)\)$/.exec(v);
        return ref ? res(scheme.get(ref[1]!) ?? v) : v;
      };
      const colours = roles.map((r) => res(`var(--ocx-color-code-${r})`));
      expect(new Set(colours).size, colours.join(' ')).toBe(roles.length);
    }
  });
});
