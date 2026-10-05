// The root search never merges a bundle of a section infra/bunny/legacy.json still lists (C-308 fallback).
import { describe, expect, it } from 'vitest';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { mergeTargets } from '@ocx-sh/theme/nav';
import legacy from '../infra/bunny/legacy.json' with { type: 'json' };
import { liveMergeIndex } from './legacy-search.mjs';

const bundles = mergeTargets(nav, '/').map((t) => ({ bundlePath: `${t.path}pagefind/` }));
const legacyPaths = legacy.entries.flatMap((e) => e.paths);

describe('liveMergeIndex', () => {
  it('drops exactly the merge targets the committed legacy.json lists', () => {
    const live = liveMergeIndex(legacy, bundles).map((m) => m.bundlePath);
    for (const { bundlePath } of bundles)
      expect(live.includes(bundlePath), bundlePath).toBe(!legacyPaths.includes(bundlePath.replace(/pagefind\/$/, '')));
  });

  it('keeps a section once its legacy entry is deleted, and a legacy directory covers what is under it', () => {
    const only = (...paths: string[]) => ({ entries: [{ paths }] });
    expect(liveMergeIndex(only('/integrations/bazel/'), bundles).map((m) => m.bundlePath)).toContain('/docs/pagefind/');
    expect(liveMergeIndex(only('/integrations/'), bundles).map((m) => m.bundlePath)).not.toContain(
      '/integrations/python/pagefind/',
    );
  });

  it('matches a legacy path written without its trailing slash', () => {
    const live = (p: string) => liveMergeIndex({ entries: [{ paths: [p] }] }, bundles).map((m) => m.bundlePath);
    expect(live('/integrations/bazel')).not.toContain('/integrations/bazel/pagefind/');
    expect(live('/integrations')).not.toContain('/integrations/python/pagefind/');
    expect(live('/docs')).not.toContain('/docs/pagefind/');
    expect(live('/integrations/bazel')).toContain('/docs/pagefind/');
  });
});
