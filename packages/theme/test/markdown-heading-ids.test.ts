// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import assert from 'node:assert/strict';
import { mdxToJs } from 'satteri';
import { test } from 'vitest';

import { headingIds } from '../src/markdown/index.mjs';

const mdx = async (source: string) =>
  (await mdxToJs(source, { features: { headingAttributes: true }, hastPlugins: [headingIds] })).code;

test('an escaped \\{#id\\} in MDX sets the id and leaves the heading text', async () => {
  const code = await mdx('## Update \\{#updating\\}\n');
  assert.match(code, /id: "updating",\s*children: "Update"/);
});

test('an escaped id after inline code keeps the code', async () => {
  const code = await mdx('## Run `ocx` \\{#run\\}\n');
  assert.match(code, /id: "run"/);
  assert.doesNotMatch(code, /\{#run\}/);
});

test('the unescaped {#id} Sätteri reads is unchanged', async () => {
  assert.match(await mdx('## Plain {#plain}\n'), /id: "plain",\s*children: "Plain"/);
});
