// Primitives whose styles ride in base.css (Link, Breadcrumbs, Button, Loader, Skeleton's base): a component <style> would be a
// stylesheet chunk of its own, one more render-blocking request per page (Lighthouse perf 0.99).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (rel: string) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');
const SHARED = [
  ['Link', 'link'],
  ['Breadcrumbs', 'breadcrumbs'],
  ['Button', 'button'],
  ['Loader', 'loader'],
] as const;

describe('shared-sheet primitives', () => {
  it.each(SHARED)('%s has no <style>; base.css imports its sheet', (astro, css) => {
    expect(src(`components/ui/${astro}.astro`)).not.toMatch(/<style/);
    expect(src('base.css')).toContain(`@import './components/ui/${css}.css';`);
  });

  it.each(SHARED)('%s sheet sits in @layer ocx, tokens only', (_, css) => {
    const s = src(`components/ui/${css}.css`);
    expect(s).toMatch(/^@layer ocx\s*\{/m);
    expect(s).toMatch(/var\(--ocx-/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });

  it("base.css's @imports lead the sheet (CSS drops an @import after any rule)", () => {
    const body = src('base.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body.trimStart()).toMatch(/^(@import [^;]+;\s*){5}@font-face/);
  });

  it("Skeleton's base (text primitive, sweep) rides in base.css: the DependencyExplorer's first viewport paints it", () => {
    expect(src('base.css')).toContain("@import './components/ui/skeleton.css';");
    expect(src('components/ui/skeleton.css')).toMatch(/^@layer ocx\s*\{/m);
    expect(src('components/ui/Skeleton.astro')).not.toMatch(/ocx-ui-skeleton-sweep/);
  });

  it("Loader's empty <i> cells are upright: the UA italic would fetch the italic face", () => {
    expect(src('components/ui/loader.css')).toMatch(/\.ocx-ui-loader__spinner > i \{[^}]*font-style: normal/);
  });
});
