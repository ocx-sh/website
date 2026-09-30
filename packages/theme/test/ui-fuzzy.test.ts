// Track F: fuzzy.mjs, the Combobox's default matcher — subsequence ranking, one-typo tolerance,
// highlight segments, and the three-mode filter it feeds. No DOM: pure functions.
import { describe, expect, it } from 'vitest';
import { filterItems, fuzzyScore, highlight, match } from '../src/components/ui/fuzzy.mjs';

describe('fuzzyScore', () => {
  it('matches a subsequence out of order-preserving, scattered characters', () => {
    expect(fuzzyScore('CMake · find_ocx', 'cfo')).not.toBeNull();
  });

  it('ranks a tighter, word-start match above a scattered one', () => {
    const tight = fuzzyScore('CMake', 'cm');
    const scattered = fuzzyScore('find_ocx_cm', 'cm');
    expect(tight).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(tight!.score).toBeGreaterThan(scattered!.score);
  });

  it('finds no subsequence match when a character is missing entirely', () => {
    expect(fuzzyScore('cmake', 'cmz')).toBeNull();
  });

  it('tolerates a single typo (substitution) via the whole-word fallback', () => {
    // "cmbke" is not a subsequence of "kitware/cmake" (no "b" in it at all) but is one
    // substitution away from the "cmake" word.
    const hit = fuzzyScore('kitware/cmake', 'cmbke');
    expect(hit).not.toBeNull();
    expect(hit!.ranges).toEqual([{ start: 8, end: 13 }]);
  });

  it('does not typo-match a query under 3 characters', () => {
    expect(fuzzyScore('cmake', 'xk')).toBeNull();
  });

  it('rejects a word more than one edit away', () => {
    expect(fuzzyScore('cmake', 'zzzzz')).toBeNull();
  });
});

describe('match', () => {
  it('empty query matches everything with no ranges', () => {
    expect(match('cmake', '')).toEqual({ score: 0, ranges: [] });
  });

  it('contains mode ignores fuzzy order sensitivity (plain substring only)', () => {
    expect(match('cmake', 'ak', 'contains')).toEqual({ score: 0, ranges: [{ start: 2, end: 4 }] });
    expect(match('cmake', 'ka', 'contains')).toBeNull();
  });

  it('startsWith mode requires the match at index 0', () => {
    expect(match('cmake', 'cma', 'startsWith')).not.toBeNull();
    expect(match('cmake', 'ake', 'startsWith')).toBeNull();
  });
});

describe('filterItems', () => {
  const items = [
    { value: 'a', label: 'kitware/cmake' },
    { value: 'b', label: 'cmark-cli' },
    { value: 'c', label: 'CMake · find_ocx' },
  ];

  it('ranks fuzzy results best-first (a tighter, start-of-string match wins)', () => {
    expect(filterItems(items, 'cmake', 'fuzzy').map((i) => i.value)).toEqual(['c', 'a']);
  });

  it('drops items with no match at all', () => {
    expect(filterItems(items, 'zzz', 'fuzzy')).toEqual([]);
  });

  it('contains/startsWith keep original relative order', () => {
    expect(filterItems(items, 'cma', 'contains').map((i) => i.value)).toEqual(['a', 'b', 'c']);
  });

  it('empty query returns items unchanged', () => {
    expect(filterItems(items, '')).toBe(items);
  });
});

describe('highlight', () => {
  it('splits around one range', () => {
    expect(highlight('cmake', [{ start: 1, end: 3 }])).toEqual([
      { text: 'c', mark: false },
      { text: 'ma', mark: true },
      { text: 'ke', mark: false },
    ]);
  });

  it('splits around several scattered ranges', () => {
    expect(
      highlight('cmake', [
        { start: 0, end: 1 },
        { start: 4, end: 5 },
      ]),
    ).toEqual([
      { text: 'c', mark: true },
      { text: 'mak', mark: false },
      { text: 'e', mark: true },
    ]);
  });

  it('no ranges: one unmarked segment', () => {
    expect(highlight('cmake', [])).toEqual([{ text: 'cmake', mark: false }]);
  });
});
