// Asset budget (AGENTS.md › assets never flicker): every SVG the theme ships is
// inlined somewhere, so each stays optimized and small.
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../src/icons/icons.mjs';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const svgs = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.svg'));

describe('theme SVG assets', () => {
  it('finds the logo', () => {
    expect(svgs).toContain('logo.svg');
  });
  it.each(svgs)('%s is at most 2 KB', (f) => {
    expect(statSync(src + f).size).toBeLessThanOrEqual(2048);
  });
});

describe('icon registry', () => {
  it('is not empty', () => {
    expect(Object.keys(ICONS).length).toBeGreaterThan(0);
  });
  it.each(Object.entries(ICONS))('%s body is at most 2 KB', (_name, icon) => {
    expect(Buffer.byteLength(icon.body, 'utf8')).toBeLessThanOrEqual(2048);
  });
});
