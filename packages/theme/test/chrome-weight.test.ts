// C-112 budgets: two weights kept out of every page's HTML and the tags-input page's script total.
// Behaviour (the hint per platform, the popup styled once live) is e2e.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

describe('Search shortcut hint (htmlGz)', () => {
  const search = src('starlight/Search.astro');

  it('ships no inline script: both keys are in the markup and html[data-platform] picks one in CSS', () => {
    expect(search).not.toMatch(/is:inline/);
    expect(search).toMatch(/class="ocx-search__ctrl"/);
    expect(search).toMatch(/class="ocx-search__cmd">⌘</);
    expect(search).toMatch(/:root\[data-platform='mac'\] \.ocx-search__ctrl/);
    expect(search).toMatch(/:root:not\(\[data-platform='mac'\]\) \.ocx-search__cmd/);
    expect(search).toMatch(/:root:not\(\[data-platform\]\) site-search button > kbd/);
  });

  it('names Meta+K on a Mac from the external script', () => {
    expect(search).toMatch(
      /dataset\['platform'\] === 'mac'\) trigger\?\.setAttribute\('aria-keyshortcuts', 'Meta\+K'\)/,
    );
  });
});

describe('TagsInput popup sheet (postJsGz)', () => {
  it('is a stylesheet linked when the machine loads, not CSS text in the chunk', () => {
    expect(src('components/ui/tags-input.zag.mjs')).not.toMatch(/\.css\?inline/);
    const astro = src('components/ui/TagsInput.astro');
    expect(astro).not.toMatch(/import\s+['"]\.\/overlay\.css['"]/);
    expect(astro).toMatch(/import\s+overlay\s+from\s+['"]\.\/overlay\.css\?url['"]/);
    expect(astro).toMatch(/Promise\.all\(\[import\('\.\/tags-input\.zag\.mjs'\), sheet\(\)\]\)/);
  });
});
