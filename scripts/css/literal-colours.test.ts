// C-029: literal-colours.mjs goes red on a colour literal outside a token declaration (gate.md › literal-colours.mjs).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = new URL('literal-colours.mjs', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'literal-colours-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function run(ext: string, body: string) {
  const p = join(dir, `f${n++}${ext}`);
  writeFileSync(p, body);
  return spawnSync(process.execPath, [script, p], { encoding: 'utf8' });
}

describe('literal-colours.mjs', () => {
  it('C-029: token-only CSS passes with empty output', () => {
    const r = run('.css', '@layer ocx{a{color:var(--ocx-color-fg);background:var(--ocx-color-bg)}}');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: var() fallbacks and custom-property declaration RHS are not hits', () => {
    const r = run(
      '.css',
      ':root{--ocx-color-bg:#f6f7f9;--ocx-color-overlay:rgba(0,0,0,.6);--x:oklch(70% .1 200);--y:hsl(0 0% 0%)}' +
        'a{color:var(--ocx-color-fg, #123456);border-color:var(--ocx-color-border,rgb(1 2 3))}',
    );
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it.each([
    ['hex', 'a{color:#ff0000}', '#ff0000'],
    ['rgb', 'a{color:rgb(1 2 3)}', 'rgb('],
    ['rgba', 'a{color:rgba(1,2,3,.5)}', 'rgba('],
    ['hsl', 'a{color:hsl(10 20% 30%)}', 'hsl('],
    ['oklch', 'a{color:oklch(70% 0.1 200)}', 'oklch('],
  ])('C-029: a %s literal in a normal declaration goes red and is printed', (_kind, css, hit) => {
    const r = run('.css', `@layer ocx{${css}}`);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(hit);
  });

  it('C-029: zero paths is a FAIL, not a silent pass', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('C-029: a violating inline <style> in .html goes red', () => {
    const r = run('.html', '<html><head><style>a{color:#abcdef}</style></head><body></body></html>');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('#abcdef');
  });

  it('C-029: a clean inline <style> in .html passes (a #fragment href is not CSS)', () => {
    const r = run(
      '.html',
      '<html><head><style>a{color:var(--ocx-color-fg)}</style></head><body><a href="#abc">skip</a></body></html>',
    );
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: a #0000 (minified transparent) does not mask a real literal in the same declaration', () => {
    const r = run('.css', 'a{box-shadow:0 0 0 1px #f00,0 0 #0000}');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('#f00');
  });

  it('C-029: #0000 / #00000000 alone are transparent, not hits', () => {
    const r = run('.css', 'a{box-shadow:0 0 #0000;outline-color:#00000000}');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });
});
