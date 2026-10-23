// prose-code.css: hljs-* classes map to the shared code tokens only, and only from the opt-in file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const src = join(import.meta.dirname, '../src');
const css = readFileSync(join(src, 'prose-code.css'), 'utf8');

it('colours every mapped hljs class from a --ocx-color-code-* token, never a raw value', () => {
  const colours = [...css.matchAll(/(?<![-\w])color:\s*([^;]+);/g)].map((m) => m[1]!.trim());
  expect(colours.length).toBeGreaterThan(5);
  for (const c of colours) expect(c).toMatch(/^var\(--ocx-color-code-[a-z]+\)$/);
  for (const c of ['keyword', 'string', 'comment', 'number', 'title', 'attr', 'built_in', 'meta'])
    expect(css, c).toContain(`.hljs-${c}`);
});

it('stays out of base.css', () => {
  expect(readFileSync(join(src, 'base.css'), 'utf8')).not.toContain('hljs');
});

// D-175 D-178: README fences (hljs-*) and docs fences (a Shiki theme written as var(--ocx-color-code-*))
// follow the scheme only if every code token is defined for both light and dark.
const tokens = readFileSync(join(src, 'tokens.css'), 'utf8');

it('D-175 D-178 every --ocx-color-code-* token prose-code.css uses is defined in light and dark', () => {
  const used = new Set([...css.matchAll(/var\((--ocx-color-code-[a-z]+)\)/g)].map((m) => m[1]!));
  expect(used.size).toBeGreaterThan(5);
  for (const t of used) {
    const defs = tokens.split(`${t}:`).length - 1;
    expect(defs, `${t} in light and dark`).toBeGreaterThanOrEqual(2);
  }
});
