// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { remarkHeadingIds } from '../src/remark/heading-ids.mjs';

interface TestNode {
  type: string;
  url?: string;
  value?: string;
  lang?: string | null;
  children: TestNode[];
  data?: { hProperties?: { id?: string } };
}

// The parser packages arrive with the site's package.json; import them when a test runs.
async function headings(source: string, { mdx = false } = {}): Promise<TestNode[]> {
  const { unified } = await import('unified');
  const { default: remarkParse } = await import('remark-parse');
  const { VFile } = await import('vfile');
  const processor = unified().use(remarkParse);
  if (mdx) processor.use((await import('remark-mdx')).default);
  processor.use(remarkHeadingIds);
  const file = new VFile({ value: source, path: '/docs/page.md' });
  const tree = (await processor.run(processor.parse(file), file)) as unknown as TestNode;
  return tree.children.filter((node) => node.type === 'heading');
}

const text = (node: TestNode) => node.children.map((child) => child.value ?? '').join('');

test('markdown {#id} becomes the heading id and leaves the text', async () => {
  const [heading] = (await headings('## Install the CLI {#install-cli}\n')) as [TestNode];
  assert.equal(heading.data?.hProperties?.id, 'install-cli');
  assert.equal(text(heading), 'Install the CLI');
});

test('MDX \\{#id\\} becomes the heading id and leaves the text', async () => {
  const [heading] = (await headings('## Install the CLI \\{#install-cli\\}\n', { mdx: true })) as [TestNode];
  assert.equal(heading.data?.hProperties?.id, 'install-cli');
  assert.equal(text(heading), 'Install the CLI');
});

test('a suffix after inline code drops the whole trailing text node', async () => {
  const [heading] = (await headings('### `OCX_HOME` {#ocx-home}\n')) as [TestNode];
  assert.equal(heading.data?.hProperties?.id, 'ocx-home');
  assert.deepEqual(
    heading.children.map((child) => child.type),
    ['inlineCode'],
  );
});

test('a heading without a suffix is untouched', async () => {
  const [heading] = (await headings('## Plain heading\n')) as [TestNode];
  assert.equal(heading.data, undefined);
  assert.equal(text(heading), 'Plain heading');
});

test('a brace group that is not a trailing id is untouched', async () => {
  const [heading] = (await headings('## Set {#not-last} twice\n')) as [TestNode];
  assert.equal(heading.data, undefined);
  assert.equal(text(heading), 'Set {#not-last} twice');
});
