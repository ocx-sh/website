// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { markdownToHtml } from 'satteri';
import { test } from 'vitest';

import { includes } from '../src/markdown/includes.mjs';

function site() {
  const srcDir = mkdtempSync(join(tmpdir(), 'includes-'));
  mkdirSync(join(srcDir, '_scripts'));
  mkdirSync(join(srcDir, 'docs'));
  writeFileSync(join(srcDir, '_scripts', 'demo.sh'), '#!/bin/sh\necho demo\n');
  writeFileSync(join(srcDir, 'snippet.md'), 'dropped one\ndropped two\n# Kept heading\n\nkept body\n');
  return srcDir;
}

async function run(srcDir: string, source: string): Promise<string> {
  const fileURL = pathToFileURL(join(srcDir, 'docs', 'page.md'));
  return (await markdownToHtml(source, { mdastPlugins: [includes({ srcDir })], fileURL })).html.trim();
}

test('<<< @/path{lang} becomes a fenced block of the file', async () => {
  const html = await run(site(), '<<< @/_scripts/demo.sh{sh}\n');
  assert.equal(html, '<pre><code class="language-sh">#!/bin/sh\necho demo\n</code></pre>');
});

test('<!--@include: path{3,}--> splices lines 3 to the end as markdown', async () => {
  const html = await run(site(), '<!--@include: ../snippet.md{3,}-->\n');
  assert.equal(html, '<h1>Kept heading</h1>\n<p>kept body</p>');
});

test('an include without a range takes the whole file', async () => {
  assert.match(await run(site(), '<!--@include: ../snippet.md-->\n'), /^<p>dropped one/);
});

test('a missing file is an error that names the path', async () => {
  await assert.rejects(run(site(), '<<< @/_scripts/absent.sh{sh}\n'), /absent\.sh/);
});

test('an include that escapes srcDir is refused, by either form', async () => {
  const srcDir = site();
  await assert.rejects(run(srcDir, '<<< @/../outside{sh}\n'), /outside/);
  await assert.rejects(run(srcDir, '<!--@include: ../../outside.md-->\n'), /outside/);
});

test('a symlink pointing outside srcDir is refused', async () => {
  const srcDir = site();
  const target = mkdtempSync(join(tmpdir(), 'includes-secret-'));
  writeFileSync(join(target, 'secret.txt'), 'secret\n');
  symlinkSync(join(target, 'secret.txt'), join(srcDir, 'link.txt'));
  await assert.rejects(run(srcDir, '<<< @/link.txt{txt}\n'), /resolves outside/);
});

test('a cyclic markdown include names the chain', async () => {
  const srcDir = site();
  writeFileSync(join(srcDir, 'a.md'), '<!--@include: b.md-->\n');
  writeFileSync(join(srcDir, 'b.md'), '<!--@include: a.md-->\n');
  await assert.rejects(run(srcDir, '<!--@include: ../a.md-->\n'), /include cycle: .*a\.md -> .*b\.md -> .*a\.md/);
});

test("an included file's own includes expand, but not inside its code fences", async () => {
  const srcDir = site();
  writeFileSync(
    join(srcDir, 'outer.md'),
    'outer\n\n<!--@include: snippet.md{5,}-->\n\n```md\n<!--@include: snippet.md-->\n```\n',
  );
  const html = await run(srcDir, '<!--@include: ../outer.md-->\n');
  assert.match(html, /<p>kept body<\/p>/);
  assert.match(html, /<code class="language-md">&lt;!--@include: snippet.md--&gt;/);
  assert.doesNotMatch(html, /dropped/);
});

test('a code include whose file holds a fence gets a longer fence', async () => {
  const srcDir = site();
  writeFileSync(join(srcDir, 'fenced.md'), 'a\n```sh\nb\n```\n');
  assert.match(await run(srcDir, '<<< @/fenced.md{md}\n'), /<code class="language-md">a\n```sh\nb\n```\n<\/code>/);
});
