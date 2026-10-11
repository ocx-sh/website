// scripts/lhci-select.mjs: which audited URLs a changed file selects for `task lighthouse:changed`.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { examplePages } from '../tests/budgets.mjs';
import { FAN_OUT_MAX, SMOKE, loadContext, selectUrls } from './lhci-select.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const C = 'packages/theme/src/components/';
const SITE = ['/', '/apps/', '/integrations/', '/404.html'];

const many = Array.from({ length: FAN_OUT_MAX + 1 }, (_, i) => `/docs/components/p${i}/`);
const ctx = {
  importers: new Map([
    [`${C}terminal.mjs`, new Set([`${C}Terminal.astro`])],
    [`${C}ui/Icon.astro`, new Set([`${C}Terminal.astro`, `${C}ui/Button.astro`])],
    [`${C}ui/zag.mjs`, new Set(['packages/theme/src/starlight/Search.astro'])],
  ]),
  pages: new Map<string, Set<string>>([
    ['/docs/components/terminal/', new Set([`${C}Terminal.astro`])],
    ['/docs/stories/terminal/open/', new Set([`${C}Terminal.astro`])],
    ['/docs/components/button/', new Set([`${C}ui/Button.astro`])],
    ...many.map((p): [string, Set<string>] => [p, new Set([`${C}ui/Button.astro`])]),
  ]),
  siteUses: new Set([`${C}HubGrid.astro`]),
};
ctx.pages.set('/docs/components/hub-grid/', new Set([`${C}HubGrid.astro`]));
const ALL = [
  '/docs/',
  '/docs/components/terminal/',
  '/docs/stories/terminal/open/',
  '/docs/components/button/',
  '/docs/components/hub-grid/',
  '/docs/components/tabs/',
  '/docs/stories/tabs/default/',
  ...many,
  ...SITE,
];
const select = (...files: string[]) => selectUrls(files, ALL, ctx);

describe('selectUrls', () => {
  it('always selects the smoke set', () => {
    expect(select().urls).toEqual(['/docs/', '/']);
    expect(SMOKE).toEqual(['/', '/docs/']);
  });

  it('a component helper selects every page rendering its importer', () => {
    expect(select(`${C}terminal.mjs`).urls).toEqual([
      '/docs/',
      '/docs/components/terminal/',
      '/docs/stories/terminal/open/',
      '/',
    ]);
  });

  it('a component the root site imports selects the site pages too', () => {
    expect(select(`${C}HubGrid.astro`).urls).toEqual(['/docs/', '/docs/components/hub-grid/', ...SITE]);
  });

  it('a component past the fan-out cap is global and keeps only its own page', () => {
    const r = select(`${C}ui/Button.astro`);
    expect(r.urls).toEqual(['/docs/', '/docs/components/button/', '/']);
    expect(r.global).toEqual([`${C}ui/Button.astro`]);
  });

  it('a file reaching a non-component theme file, or any other theme file, is global', () => {
    expect(select(`${C}ui/zag.mjs`, 'packages/theme/src/base.css').global).toHaveLength(2);
    expect(select(`${C}ui/zag.mjs`).urls).toEqual(['/docs/', '/']);
  });

  it('a story selects its route and its component page; a doc source its own route', () => {
    expect(select('examples/starlight/src/stories/tabs/default.mdx').urls).toEqual([
      '/docs/',
      '/docs/components/tabs/',
      '/docs/stories/tabs/default/',
      '/',
    ]);
    expect(select('examples/starlight/src/content/docs/components/tabs.mdx').urls).toContain('/docs/components/tabs/');
  });

  it('a root-site source selects every site page; unrelated files nothing', () => {
    expect(select('site/src/pages/robots.txt.ts').urls).toEqual(['/docs/', ...SITE]);
    expect(select('README.md', 'infra/bunny/legacy.json')).toEqual(select());
  });
});

describe('loadContext (this repo)', () => {
  it('maps Terminal.astro to the terminal page and its stories', () => {
    const urls = selectUrls([`${C}Terminal.astro`], examplePages(), loadContext(ROOT)).urls;
    expect(urls).toContain('/docs/components/terminal/');
    expect(urls).toContain('/docs/stories/terminal/default/');
    expect(urls).not.toContain('/docs/components/tabs/');
  });
});
