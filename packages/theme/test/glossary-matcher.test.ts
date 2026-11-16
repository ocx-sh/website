// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { describe, expect, it } from 'vitest';
import { matcher } from '../src/glossary/matcher.mjs';

import { TERMS, row } from './glossary-terms.ts';

const find = matcher(TERMS);
const ids = (text: string) => find(text).map((h) => h.id);
const texts = (text: string) => find(text).map((h) => h.text);

describe('matcher: what matches', () => {
  it('finds a variant, keeping the source text and the offsets', () => {
    expect(find('Install the packages now.')).toEqual([{ id: 'package', text: 'packages', start: 12, end: 20 }]);
  });

  it('matches only listed variants: no stemming', () => {
    expect(ids('packaged indexing platformer')).toEqual([]);
  });

  it('prefers the longest form: image index over index, OCI image index over image index', () => {
    expect(ids('an image index and an OCI image index')).toEqual(['image-index', 'image-index']);
    expect(texts('an image index and an OCI image index')).toEqual(['image index', 'OCI image index']);
    expect(ids('the index')).toEqual(['index']);
  });

  it('treats a soft line break inside a form as the space', () => {
    expect(texts('the image\nindex here')).toEqual(['image\nindex']);
  });
});

describe('matcher: the case rule', () => {
  it('matches an all-lowercase form in any case and keeps the source case', () => {
    expect(texts('Package and PACKAGES')).toEqual(['Package', 'PACKAGES']);
  });

  it('matches a form with an uppercase letter exactly', () => {
    expect(ids('the SET and the set')).toEqual(['set']);
    expect(ids('ocx home and OCX home')).toEqual(['ocx-home']);
    expect(texts('OCX home')).toEqual(['OCX home']);
  });
});

describe('matcher: word boundaries', () => {
  it.each([
    ['multi-platform', 'platform after a hyphen'],
    ['index.ocx.sh', 'index before .letter'],
    ['$OCX_HOME', 'a shell variable'],
    ['--platform', 'a flag'],
    ['metadata.json', 'a file name'],
    ['ocx-index', 'a hyphenated name'],
    ['a/package/b', 'a path segment'],
    ['package/', 'a path before a slash'],
    ['user@index', 'after @'],
    ['pkg_index', 'after an underscore'],
    ['some:index', 'after a colon'],
    ['#package', 'after a hash'],
    ['platform-specific', 'before a hyphen'],
  ])('never matches inside %s (%s)', (text) => {
    expect(find(text)).toEqual([]);
  });

  it.each([
    ['(package)', 'package'],
    ['"package"', 'package'],
    ['package.', 'package'],
    ['package, index', 'package'],
    ['a package—index', 'package'],
  ])('matches at the edge of punctuation: %s', (text, first) => {
    expect(ids(text)[0]).toBe(first);
  });

  it('a sentence end is not a file extension: package. Next', () => {
    expect(ids('Each package. Next index')).toEqual(['package', 'index']);
  });
});

describe('matcher: except phrases', () => {
  it('consume their text so the term inside them links nothing', () => {
    expect(ids('a package manager')).toEqual([]);
    expect(ids('package managers and a package')).toEqual(['package']);
    expect(texts('package managers and a package')).toEqual(['package']);
  });
});

describe("matcher: match 'avoid'", () => {
  const banned = matcher(TERMS, { match: 'avoid' });

  it('finds the banned synonyms, reporting the term to use', () => {
    expect(banned('A package store and the three-tier CAS.')).toEqual([
      { id: 'object-store', text: 'package store', start: 2, end: 15 },
      { id: 'object-store', text: 'three-tier CAS', start: 24, end: 38 },
    ]);
  });

  it('does not report the variants, and applies the same boundaries and except phrases', () => {
    expect(banned('the object store, a package manager, multi-package store')).toEqual([]);
  });
});

describe('matcher: edge inputs', () => {
  it('an empty glossary and an empty string match nothing', () => {
    expect(matcher([])('package')).toEqual([]);
    expect(find('')).toEqual([]);
  });

  it('is reusable: the same text twice gives the same hits (no regex state left over)', () => {
    expect(find('package index')).toEqual(find('package index'));
  });

  it('escapes regex characters in a form', () => {
    const f = matcher([row('c', ['C++', 'a.b'])]);
    expect(f('use C++ and a.b but not axb').map((h) => h.text)).toEqual(['C++', 'a.b']);
  });
});
