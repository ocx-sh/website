// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';

import { remarkIncludes } from '../src/remark/includes.mjs';

interface TestNode {
  type: string;
  url?: string;
  value?: string;
  lang?: string | null;
  children: TestNode[];
  data?: { hProperties?: { id?: string } };
}

function site() {
  const srcDir = mkdtempSync(join(tmpdir(), 'includes-'));
  mkdirSync(join(srcDir, '_scripts'));
  mkdirSync(join(srcDir, 'docs'));
  writeFileSync(join(srcDir, '_scripts', 'demo.sh'), '#!/bin/sh\necho demo\n');
  writeFileSync(join(srcDir, 'snippet.md'), 'dropped one\ndropped two\n# Kept heading\n\nkept body\n');
  return srcDir;
}

async function run(srcDir: string, source: string): Promise<TestNode> {
  const { unified } = await import('unified');
  const { default: remarkParse } = await import('remark-parse');
  const { VFile } = await import('vfile');
  const processor = unified().use(remarkParse).use(remarkIncludes, { srcDir });
  const file = new VFile({ value: source, path: join(srcDir, 'docs', 'page.md') });
  return (await processor.run(processor.parse(file), file)) as unknown as TestNode;
}

test('<<< @/path{lang} becomes a fenced block of the file', async () => {
  const tree = await run(site(), '<<< @/_scripts/demo.sh{sh}\n');
  assert.equal(tree.children.length, 1);
  assert.deepEqual(
    { type: tree.children[0]!.type, lang: tree.children[0]!.lang, value: tree.children[0]!.value },
    { type: 'code', lang: 'sh', value: '#!/bin/sh\necho demo' },
  );
});

test('<!--@include: path{3,}--> splices lines 3 to the end as markdown', async () => {
  const tree = await run(site(), '<!--@include: ../snippet.md{3,}-->\n');
  assert.deepEqual(
    tree.children.map((node) => node.type),
    ['heading', 'paragraph'],
  );
  assert.equal(tree.children[0]!.children[0]!.value, 'Kept heading');
  assert.equal(tree.children[1]!.children[0]!.value, 'kept body');
});

test('an include without a range takes the whole file', async () => {
  const tree = await run(site(), '<!--@include: ../snippet.md-->\n');
  assert.equal(tree.children[0]!.type, 'paragraph');
  assert.match(tree.children[0]!.children[0]!.value ?? '', /^dropped one/);
});

test('a missing file is an error that names the path', async () => {
  await assert.rejects(run(site(), '<<< @/_scripts/absent.sh{sh}\n'), /absent\.sh/);
});
