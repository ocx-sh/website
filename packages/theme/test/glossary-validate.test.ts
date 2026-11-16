// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GlossaryTerm } from '../src/glossary/types.mjs';
import { glossaryMarkdown } from '../src/glossary/markdown.mjs';
import { validate } from '../src/glossary/validate.mjs';
import { row, TERMS } from './glossary-terms.ts';

const EXAMPLE = JSON.parse(
  readFileSync(new URL('../../../examples/starlight/src/data/glossary.json', import.meta.url), 'utf8'),
) as GlossaryTerm[];

describe('validate', () => {
  it('accepts sound data, the example glossary included', () => {
    expect(validate(TERMS)).toEqual([]);
    expect(validate(EXAMPLE)).toEqual([]);
  });

  it('rejects data that is not an array of objects', () => {
    expect(validate({})).toEqual(['glossary data is not an array']);
    expect(validate([null])).toEqual(['#0: not an object']);
  });

  it('names a duplicate id', () => {
    expect(validate([row('a', ['a']), row('a', ['b'])])).toEqual(['a: duplicate id']);
  });

  it('names a form two terms both claim, in any case for a lowercase form', () => {
    expect(validate([row('a', ['x']), row('b', ['X'])])).toEqual([]); // exact `X` is not lowercase `x`
    expect(validate([row('a', ['Foo']), row('b', ['Foo'])])).toEqual(['b.variants: "Foo" is already a form of "a"']);
    expect(validate([row('a', ['foo']), row('b', ['foo'])])).toEqual(['b.variants: "foo" is already a form of "a"']);
  });

  it('checks the shape of excludePages', () => {
    const ok = (excludePages: unknown) => validate([{ ...row('a', ['a']), excludePages }]);
    expect(ok(['integration/github-actions/'])).toEqual([]);
    const shape = ['a.excludePages: must be a non-empty array of non-empty strings'];
    expect(ok([])).toEqual(shape);
    expect(ok([''])).toEqual(shape);
    expect(ok('x/')).toEqual(shape);
    expect(ok([3])).toEqual(shape);
    expect(ok(['https://x.sh/a/'])[0]).toContain('not a URL');
    expect(ok(['a/../b/'])[0]).toContain('not a URL');
  });

  it('names a form listed twice in one term', () => {
    expect(validate([row('a', ['x', 'x'])])).toEqual(['a.variants: "x" is listed twice']);
  });

  it('rejects a definition of 26 words and accepts 25', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    expect(validate([row('a', ['a'], { definition: words(25) })])).toEqual([]);
    expect(validate([row('a', ['a'], { definition: words(26) })])).toEqual([
      'a: definition has 26 words, the limit is 25',
    ]);
  });

  it('rejects a learnMore that is neither a docs route nor a URL', () => {
    for (const bad of ['no-slash', '/abs/', 'a b/', 'a/#', 'ftp://x/y'])
      expect(validate([row('a', ['a'], { learnMore: bad })]), bad).toHaveLength(1);
    for (const good of ['a/', 'a/b/#c-d', 'https://example.com/x'])
      expect(validate([row('a', ['a'], { learnMore: good })]), good).toEqual([]);
  });

  it('rejects an empty variants list, a missing field, an unknown field and a bad id', () => {
    expect(validate([row('a', [])])).toContain('a: variants is empty');
    const { definition: _drop, ...rest } = row('a', ['a']);
    expect(validate([rest])).toEqual(['a: "definition" must be a non-empty string']);
    expect(validate([{ ...row('a', ['a']), color: 'red' }])).toEqual(['a: unknown field "color"']);
    expect(validate([row('Bad_Id', ['a'])])).toEqual(['Bad_Id: id must be lowercase words joined by hyphens']);
  });

  it('rejects an avoid form that is also a variant', () => {
    expect(validate([row('a', ['x']), row('b', ['y'], { avoid: ['x'] })])).toEqual(['b.avoid: "x" is a form of "a"']);
  });
});

describe('glossaryMarkdown', () => {
  const terms = [
    row('zeta', ['zeta'], { term: 'Zeta', category: 'two', definition: 'The last.', learnMore: 'guides/zeta/#top' }),
    row('alpha', ['alpha'], { term: 'alpha', category: 'one', definition: 'The `first`.', learnMore: 'guides/alpha/' }),
    row('beta', ['beta'], { term: 'Beta', category: 'one', learnMore: 'https://example.com/spec' }),
  ];

  it('renders a section per category and an entry per term with its See line', () => {
    expect(glossaryMarkdown(terms, { base: '/docs/', categories: { one: 'First group' } })).toBe(
      [
        '## First group {#one}',
        '',
        '### alpha {#alpha}',
        '',
        'The `first`.',
        '',
        'See [Alpha](/docs/guides/alpha/).',
        '',
        '### Beta {#beta}',
        '',
        'The beta.',
        '',
        'See [example.com](https://example.com/spec).',
        '',
        '## Two {#two}',
        '',
        '### Zeta {#zeta}',
        '',
        'The last.',
        '',
        'See [Zeta](/docs/guides/zeta/#top).',
        '',
      ].join('\n'),
    );
  });

  it('is deterministic whatever the input order, and takes page titles', () => {
    const a = glossaryMarkdown(terms, { titles: { 'guides/zeta/': 'The Zeta guide' } });
    expect(glossaryMarkdown([...terms].reverse(), { titles: { 'guides/zeta/': 'The Zeta guide' } })).toBe(a);
    expect(a).toContain('See [The Zeta guide](/guides/zeta/#top).');
  });

  it('every entry anchor is the id the plugin links to', () => {
    const md = glossaryMarkdown(EXAMPLE);
    for (const t of EXAMPLE) expect(md).toContain(`{#${t.id}}`);
  });
});

// The example site's glossary page is `glossaryMarkdown` of its data, committed: this is its drift check.
// Regenerate with `UPDATE_GLOSSARY_PAGE=1 pnpm exec vitest run packages/theme/test/glossary-validate.test.ts`.
describe('the example glossary page', () => {
  const file = new URL('../../../examples/starlight/src/content/docs/components/glossary-terms.md', import.meta.url);
  const expected = `---
title: Glossary terms
description: The twelve terms of this site's glossary, generated from its data file.
tableOfContents:
  maxHeadingLevel: 2
---

${glossaryMarkdown(EXAMPLE, {
  base: '/docs/',
  categories: {
    ocx: 'OCX',
    oci: 'OCI',
    signing: 'Signing',
    publishing: 'Publishing',
    platform: 'Platform',
    project: 'Project',
  },
  titles: { 'components/glossary/': 'Glossary' },
})}`;

  it('is current', () => {
    if (process.env['UPDATE_GLOSSARY_PAGE']) writeFileSync(file, expected);
    expect(readFileSync(file, 'utf8')).toBe(expected);
  });
});
