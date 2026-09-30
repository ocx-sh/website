// C-033: vitepress.css is entirely inside `@layer ocx` and carries no literal colours.
// Reuses the css gate scripts rather than a second parser.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const file = fileURLToPath(new URL('../src/vitepress/vitepress.css', import.meta.url));
const gate = (name: string) =>
  spawnSync(process.execPath, [fileURLToPath(new URL(`../../../scripts/css/${name}`, import.meta.url)), file], {
    encoding: 'utf8',
  });

describe('vitepress.css', () => {
  it('C-033: no rule outside a cascade layer (outside-layers.mjs)', () => {
    const r = gate('outside-layers.mjs');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });

  it('C-033: the only layer is ocx', () => {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const names = [...src.matchAll(/@layer\s+([\w.-]+)\s*\{/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set(['ocx']));
  });

  it('C-033: no literal colours (literal-colours.mjs)', () => {
    const r = gate('literal-colours.mjs');
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
  });
});
