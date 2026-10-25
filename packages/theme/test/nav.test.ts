// Contracts C-007 (activeSection) and C-034 (public `./nav` exports).
import { describe, expect, it } from 'vitest';
import nav from '../src/nav.json' with { type: 'json' };
import * as navModule from '../src/nav.mjs';
import { activeSection, catalogHref, currentHref, externalLink, installHref, isExternal } from '../src/nav.mjs';

describe('C-007 activeSection', () => {
  it.each([
    ['/docs/x/', 'docs'],
    ['/docs', 'docs'],
    ['/docsx/', ''],
    ['/integrations', 'ecosystem'],
    ['/catalog/', 'catalog'],
    ['/integrations/', 'ecosystem'],
    ['/integrations/bazel/x/', 'ecosystem'],
    ['/apps/', 'ecosystem'],
    ['/install/', 'install'],
    ['/', ''],
    ['/unknown/', ''],
  ])('C-007: %s → %j', (path, section) => {
    expect(activeSection(nav, path)).toBe(section);
  });
});

describe('C-034 ./nav exports', () => {
  it.each(['activeSection', 'validate', 'claimFor', 'claimsOf', 'zoneName', 'mergeTargets'])(
    'C-034: exports function %s',
    (name) => {
      expect(typeof (navModule as Record<string, unknown>)[name]).toBe('function');
    },
  );

  it('C-034: exports ROOT_DIRS', () => {
    expect(navModule.ROOT_DIRS).toEqual(['/_astro/', '/_shell/', '/pagefind/']);
  });
});

describe('currentHref', () => {
  it('picks the longest matching prefix, so a parent and a child are not both current', () => {
    expect(currentHref('/docs/reference/y/', ['/docs/', '/docs/reference/', '/'])).toBe('/docs/reference/');
    expect(currentHref('/docs/x/', ['/', '/docs/'])).toBe('/docs/');
  });

  it('matches the home href exactly, and is undefined when nothing matches', () => {
    expect(currentHref('/', ['/', '/docs/'])).toBe('/');
    expect(currentHref('/other/', ['/', '/docs/'])).toBeUndefined();
    expect(currentHref('/base/x/', ['/base/'], '/base/')).toBeUndefined();
  });

  it("match: 'prefix' keeps a home link current below it, and a longer link still wins", () => {
    const home = { href: '/', match: 'prefix' as const };
    expect(currentHref('/item/1/', [home, '/docs/'])).toBe('/');
    expect(currentHref('/docs/a/', [home, '/docs/'])).toBe('/docs/');
    expect(currentHref('/base/item/', [{ href: '/base/', match: 'prefix' as const }], '/base/')).toBe('/base/');
    expect(currentHref('/item/1/', [{ href: '/docs/', match: 'prefix' as const }])).toBeUndefined();
  });

  it('never matches an external href', () => {
    expect(currentHref('/docs/', ['https://e.com/docs/'])).toBeUndefined();
  });
});

describe('isExternal / externalLink', () => {
  it.each(['https://e.com/', 'http://e.com', '//e.com/x', 'HTTPS://E.COM'])('%s is external', (href) => {
    expect(isExternal(href)).toBe(true);
  });

  it.each(['/docs/', 'mailto:a@e.com', '#top', 'docs/', ''])('%j is not external', (href) => {
    expect(isExternal(href)).toBe(false);
  });

  it('externalLink gives a new tab with noopener noreferrer and the icon flag only for external links', () => {
    expect(externalLink('https://e.com/')).toEqual({
      out: true,
      attrs: { target: '_blank', rel: 'noopener noreferrer' },
    });
    expect(externalLink('/docs/')).toEqual({ out: false, attrs: {} });
  });
});

describe('installHref / catalogHref', () => {
  it('reads the install action and the catalog section from nav.json', () => {
    expect(installHref(nav)).toBe('/install/');
    expect(catalogHref(nav)).toBe('/catalog/');
  });

  it('a package page is the catalog root plus its namespace and name', () => {
    expect(catalogHref(nav, 'nodejs/node')).toBe('/catalog/nodejs/node/');
    expect(catalogHref(nav, 'astral-sh/uv')).toBe('/catalog/astral-sh/uv/');
  });

  it.each(['uv', 'nodejs/node:24', '/nodejs/node', 'nodejs//node', 'ocx.sh:443/nodejs/node'])('rejects %j', (pkg) => {
    expect(() => catalogHref(nav, pkg)).toThrow(/not <namespace>\/<name>/);
  });
});
