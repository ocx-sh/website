// C-029: outside-layers.mjs goes red on any rule outside a cascade layer (gate.md › outside-layers.mjs).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = new URL('outside-layers.mjs', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'outside-layers-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function run(files: Record<string, string>) {
  const paths = Object.entries(files).map(([ext, body]) => {
    const p = join(dir, `f${n++}${ext}`);
    writeFileSync(p, body);
    return p;
  });
  return spawnSync(process.execPath, [script, ...paths], { encoding: 'utf8' });
}

describe('outside-layers.mjs', () => {
  it('C-029: layered CSS passes with empty output', () => {
    const r = run({ '.css': '@layer ocx {\n  a { color: var(--ocx-color-fg); }\n}\n' });
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: a planted unlayered rule goes red and is printed', () => {
    const r = run({ '.css': '@layer ocx { a { color: red; } }\n.leak { margin: 0; }\n' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('.leak');
  });

  it("C-029: Starlight's unlayered Page.astro rules pass, a theme leak next to them still fails", () => {
    const upstream =
      'html:not([data-has-toc]){--sl-mobile-toc-height:0rem}main:where(.astro-asjuvud7){padding:var(--sl-main-pad)}' +
      '@media (width>=72em){html{scroll-padding-top:calc(1.5rem + var(--sl-nav-height))}}';
    expect(run({ '.css': upstream }).status).toBe(0);
    const r = run({ '.css': `${upstream}.ocx-leak{margin:0}` });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe(`${r.stdout.split(':')[0]}: .ocx-leak{margin:0}\n`);
  });

  it('C-029: an upstream rule carrying an extra theme declaration is not allowlisted', () => {
    const r = run({ '.css': 'html{scroll-padding-top:0;color:red}' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('color:red');
  });

  it('C-029: allowlisted entries print with their reason on stderr', () => {
    const r = run({ '.css': 'html{scroll-padding-top:0}' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('Page.astro');
  });

  it('C-029: zero paths is a FAIL, not a silent pass', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(r.status).toBe(1);
  });

  it('C-029: any layer name passes, incl. dotted astro.images and nested layers', () => {
    const r = run({
      '.css':
        '@layer astro.images{img{max-width:100%}}@layer ocx{@layer base{a{color:inherit}}@media (min-width:50rem){b{margin:0}}}',
    });
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: @property, @font-face, bare @layer statements and comments are ignored', () => {
    const r = run({
      '.css': [
        '/*! license */',
        '@layer ocx, starlight;',
        "@property --x { syntax: '<length>'; inherits: false; initial-value: 0px; }",
        "@font-face { font-family: Inter; src: url(inter.woff2) format('woff2'); }",
        '@layer ocx { a { color: inherit; } }',
      ].join('\n'),
    });
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-029: a leak in minified one-line CSS goes red', () => {
    const r = run({ '.css': '@layer ocx{a{color:inherit}}:root{--leak:1px}@layer b{c{d:e}}' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(':root');
  });

  it('C-029: a violating inline <style> in .html goes red', () => {
    const r = run({
      '.html':
        '<!doctype html><html><head><style>@layer astro{x{y:z}}.inline-leak{color:red}</style></head><body><p>hi</p></body></html>',
    });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('.inline-leak');
  });

  it('C-029: a clean inline <style> in .html passes (markup outside <style> is not CSS)', () => {
    const r = run({
      '.html':
        '<!doctype html><html><head><style data-astro-transition>@layer astro{::view-transition{x:y}}</style></head><body><p>a { b }</p></body></html>',
    });
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });
});
