// Contracts C-007 (activeSection) and C-034 (public `./nav` exports).
import { describe, expect, it } from 'vitest';
import nav from '../src/nav.json' with { type: 'json' };
import * as navModule from '../src/nav.mjs';
import { activeSection } from '../src/nav.mjs';

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
    expect(navModule.ROOT_DIRS).toEqual(['/_astro/', '/pagefind/']);
  });
});
