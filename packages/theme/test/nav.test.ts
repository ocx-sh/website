import { describe, expect, it } from 'vitest';
import nav from '../src/nav.json' with { type: 'json' };
import { activeSection } from '../src/nav.ts';

describe('activeSection', () => {
  it.each([
    ['/docs/getting-started/', 'docs'],
    ['/catalog/', 'catalog'],
    ['/install/', 'install'],
    ['/integrations/bazel/defs/', 'ecosystem'],
    ['/integrations/', 'ecosystem'],
    ['/apps/', 'ecosystem'],
    ['/', ''],
  ])('%s → %s', (path, section) => {
    expect(activeSection(nav, path)).toBe(section);
  });
});
