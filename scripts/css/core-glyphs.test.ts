// core-glyphs.mjs goes red on a page whose text has a rest-only Plex character and stays green otherwise.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = new URL('core-glyphs.mjs', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'core-glyphs-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

let n = 0;
function run(html: string, page = 'docs', css?: string) {
  const dist = join(tmp, `d${n++}`);
  mkdirSync(join(dist, page), { recursive: true });
  writeFileSync(join(dist, page, 'index.html'), html);
  if (css !== undefined) {
    mkdirSync(join(dist, '_astro'), { recursive: true });
    writeFileSync(join(dist, '_astro', 'a.css'), css);
  }
  return spawnSync(process.execPath, [script, dist], { encoding: 'utf8' });
}

describe('core-glyphs.mjs', () => {
  it('passes core text, entities for core characters, and characters Plex never had', () => {
    const r = run('<p>Plain “quoted” &mdash; ok &amp; 5&nbsp;× 3 ↑ 🙂 日本</p>');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('ignores rest characters in scripts, styles and attributes', () => {
    const r = run('<script>var s = "é";</script><style>a::after{content:"é"}</style><img alt="é" src="x">');
    expect(r.status).toBe(0);
  });

  it.each([
    ['<p>café</p>', 'U+00E9'],
    ['<p>caf&#233;</p>', 'U+00E9'],
    ['<p>a&#x20AC;</p>', 'U+20AC'],
    ['<p>caf&eacute;</p>', 'U+00E9'],
    ['<p>&euro;5 &hellip;</p>', 'U+20AC'],
    ['<input placeholder="café">', 'U+00E9'],
    ['<input value="Zürich">', 'U+00FC'],
    ['<select><option label="año">x</option></select>', 'U+00F1'],
    ['<template><p>café</p></template>', 'U+00E9'],
  ])('fails on %s', (html, cp) => {
    const r = run(html);
    expect(r.stdout).toContain(cp);
    expect(r.stdout).toContain('docs/index.html');
    expect(r.status).toBe(1);
  });

  it.each([
    ['a::after{content:"é"}', 'U+00E9'],
    ["a::before{content: '\\e9 x'}", 'U+00E9'],
    ['a::before{content:"\\20AC"}', 'U+20AC'],
  ])('fails on a stylesheet with %s', (css, cp) => {
    const r = run('<p>ok</p>', 'docs', css);
    expect(r.stdout).toContain(cp);
    expect(r.stdout).toContain('a.css');
    expect(r.status).toBe(1);
  });

  it('passes stylesheet content strings in the core, and ignores a value on a non-input', () => {
    const r = run(
      '<p data-x="é"><a title="é" alt="é"></a><option value="é">x</option></p>',
      'docs',
      'a::after{content:"→ \\2192"}',
    );
    expect(r.status).toBe(0);
  });

  it('allows the glyph probe fixture, and only it', () => {
    expect(run('<p>café</p>', 'docs/probe/glyphs').status).toBe(0);
    expect(run('<p>café</p>', 'docs/probe/long').status).toBe(1);
  });

  it('fails with no dist given', () => {
    expect(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status).toBe(1);
  });
});
