// Contract: F4 leftovers. Icon sizes come from tokens, Pagination hover is neutral,
// the scroll region's focus ring sits inset. (DataTable's early arm: components-data-table.test.ts.)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('chrome misc', () => {
  it.each([
    ['components/CopyButton.astro', '--ocx-icon-ms'],
    ['base.css', '--ocx-icon-ml'],
  ])('%s sizes its icon by %s, no raw px', (file, token) => {
    const src = read(file);
    expect(src).toContain(`inline-size: var(${token})`);
    expect(src).toContain(`block-size: var(${token})`);
    expect(src).not.toMatch(/(?:inline|block)-size:\s*\d+px/);
  });

  it('Pagination hover is the neutral hover border, never accent', () => {
    const src = read('components/Pagination.astro');
    const hover = src.slice(src.indexOf(':hover'), src.indexOf('[data-selected] {'));
    expect(hover).toContain('background: var(--ocx-color-hover)');
    expect(hover).toContain('--ocx-color-hover-border');
    expect(hover).not.toContain('accent');
  });

  it('Pagination disabled prev/next reset the hover background', () => {
    const src = read('components/Pagination.astro');
    const disabled = src.slice(src.indexOf('[data-disabled] {'));
    expect(disabled.slice(0, disabled.indexOf('}'))).toContain('background: transparent');
  });

  it('.ocx-table-scroll focus ring is inset', () => {
    const line = read('starlight/starlight.css')
      .split('\n')
      .find((l) => l.includes('.ocx-table-scroll:focus-visible'));
    expect(line).toContain('outline-offset: var(--ocx-focus-offset-inset)');
  });

  it('the ec diff gutter is 2ch wide', () => {
    expect(read('starlight/starlight.css')).toMatch(/--ocx-ec-diff-marker-wd:\s*2ch/);
  });
});
