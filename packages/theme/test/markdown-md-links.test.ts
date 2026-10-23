// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { markdownToHtml } from 'satteri';
import { test } from 'vitest';

import { mdLinks } from '../src/markdown/md-links.mjs';

const ROOT = '/site/content/docs';
const OPTIONS = { root: ROOT, base: '/docs/' };

async function run(source: string, page = 'guide/quickstart.md'): Promise<string> {
  const fileURL = pathToFileURL(`${ROOT}/${page}`);
  return (await markdownToHtml(source, { mdastPlugins: [mdLinks(OPTIONS)], fileURL })).html;
}

const urls = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

test('a relative .md link with a fragment becomes base + route + trailing slash + fragment', async () => {
  assert.deepEqual(urls(await run('[a](./install.md#cli)\n')), ['/docs/guide/install/#cli']);
});

test('a parent-relative link and an index page route to their directory', async () => {
  const html = await run('[a](../reference/index.md) [b](../reference/environment.md)\n');
  assert.deepEqual(urls(html), ['/docs/reference/', '/docs/reference/environment/']);
});

test('a reference-style definition is rewritten', async () => {
  assert.deepEqual(urls(await run('[a][ref]\n\n[ref]: ./install.md\n')), ['/docs/guide/install/']);
});

test('external, fragment-only and tree-leaving links are untouched', async () => {
  const html = await run('[a](https://example.com/x.md) [b](#local) [c](../../../CHANGELOG.md)\n');
  assert.deepEqual(urls(html), ['https://example.com/x.md', '#local', '../../../CHANGELOG.md']);
});

test('text inside a code fence and inline code is untouched', async () => {
  const html = await run('[a](./x.md#a)\n\n```md\n[b](./x.md#a)\n```\n\n`[c](./x.md#a)`\n');
  assert.deepEqual(urls(html), ['/docs/guide/x/#a']);
  assert.match(html, /\[b\]\(\.\/x\.md#a\)/);
});
