// withBase: the site-base join Terminal (cast src) and DependencyExplorer (default data URL) share.
import { describe, expect, it } from 'vitest';
import { withBase } from '../src/components/base-url.mjs';

describe('WP13 withBase', () => {
  it.each([
    ['/casts/x.cast', '/docs/', '/docs/casts/x.cast'],
    ['/casts/x.cast', '/docs', '/docs/casts/x.cast'],
    ['/docs/casts/x.cast', '/docs/', '/docs/casts/x.cast'],
    ['/docs/casts/x.cast', '/docs', '/docs/casts/x.cast'],
    ['/casts/x.cast', '/', '/casts/x.cast'],
    ['https://ocx.sh/casts/x.cast', '/docs/', 'https://ocx.sh/casts/x.cast'],
    ['//cdn.example/x.cast', '/docs/', '//cdn.example/x.cast'],
  ])('WP13.1 Terminal: withBase(%j, %j) → %j, never double-prefixing the base (WP13.1)', (path, base, out) => {
    expect(withBase(path, base)).toBe(out);
  });

  it.each([
    ['/docs', '/docs/data/dependencies.json'],
    ['/docs/', '/docs/data/dependencies.json'],
    ['/', '/data/dependencies.json'],
  ])(
    'WP13.4 DependencyExplorer: default data URL under base %j is %j, with or without a trailing slash (L2)',
    (base, out) => {
      expect(withBase('/data/dependencies.json', base)).toBe(out);
    },
  );
});
