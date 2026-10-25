// The live header's publish step (r10): the unit (a fragment filed under its rev, the pointer written
// last and only for a valid nav) and the built output (the baked rev of every page is the published one).
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { SHELL_PARTS } from '@ocx-sh/theme/shell';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dist } from './build-site.ts';
import { FRAGMENT_FILE, publishShell } from '../shell-fragment.mjs';

const part = (name: string) => `<template data-shell-part="${name}"><li>${name}</li></template>`;
const fragment = SHELL_PARTS.map(part).join('');
const rev = (html: string) => createHash('sha256').update(html).digest('hex').slice(0, 12);

describe('publishShell', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'shell-fragment-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));
  const write = (html: string) => writeFileSync(join(tmp, FRAGMENT_FILE), html);

  it('files the fragment under its rev, points current.json at it, and removes the temporary file', async () => {
    write(fragment);
    expect(await publishShell(tmp)).toBe(rev(fragment));
    expect(readFileSync(join(tmp, '_shell/v1', rev(fragment), 'nav.html'), 'utf8')).toBe(fragment);
    expect(JSON.parse(readFileSync(join(tmp, '_shell/v1/current.json'), 'utf8'))).toEqual({ v: 1, rev: rev(fragment) });
    expect(existsSync(join(tmp, FRAGMENT_FILE))).toBe(false);
  });

  it('names the same bytes the same, and other bytes otherwise', async () => {
    write(fragment);
    const first = await publishShell(tmp);
    write(fragment);
    expect(await publishShell(tmp)).toBe(first);
    write(fragment.replace('sections</li>', 'changed</li>'));
    expect(await publishShell(tmp)).not.toBe(first);
    expect(readdirSync(join(tmp, '_shell/v1')).toSorted()).toEqual(
      [first, 'current.json', rev(fragment.replace('sections</li>', 'changed</li>'))].toSorted(),
    );
  });

  it('writes nothing for an invalid nav: the previous pointer stays', async () => {
    write(fragment);
    const broken = structuredClone(nav);
    broken.claims.pop();
    await expect(publishShell(tmp, broken)).rejects.toThrow(/nav\.json is invalid/);
    expect(existsSync(join(tmp, '_shell'))).toBe(false);
  });

  it.each([
    ['a part missing', SHELL_PARTS.slice(1).map(part).join('')],
    ['an extra part', fragment + part('footer')],
    ['the parts out of order', SHELL_PARTS.toReversed().map(part).join('')],
  ])('refuses a fragment with %s, writing no pointer', async (_, html) => {
    write(html);
    await expect(publishShell(tmp)).rejects.toThrow(/fragment has parts/);
    expect(existsSync(join(tmp, '_shell'))).toBe(false);
  });
});

describe('site dist', () => {
  const read = (file: string) => readFileSync(`${dist}${file}`, 'utf8');
  const pointer = JSON.parse(read('_shell/v1/current.json')) as { v: number; rev: string };

  it('publishes one fragment, named by the SHA-256 of its bytes, and a pointer to it', () => {
    expect(pointer.v).toBe(1);
    expect(readdirSync(`${dist}_shell/v1`).toSorted()).toEqual([pointer.rev, 'current.json'].toSorted());
    const html = read(`_shell/v1/${pointer.rev}/nav.html`);
    expect(rev(html)).toBe(pointer.rev);
    expect([...html.matchAll(/<template data-shell-part="([^"]+)">/g)].map((m) => m[1])).toEqual([...SHELL_PARTS]);
  });

  it('leaves no temporary file, no sitemap entry and no search page for the fragment', () => {
    expect(existsSync(`${dist}${FRAGMENT_FILE}`)).toBe(false);
    expect(read('sitemap-0.xml')).not.toContain('shell');
    expect(
      (JSON.parse(read('pagefind/pagefind-entry.json')) as { languages: { en: { page_count: number } } }).languages.en
        .page_count,
    ).toBe(4);
  });

  it('every page bakes the published rev', () => {
    for (const f of ['index', 'integrations/index', 'apps/index', 'team/index', '404'])
      expect(read(`${f}.html`), f).toContain(`data-nav-rev="${pointer.rev}"`);
  });
});
