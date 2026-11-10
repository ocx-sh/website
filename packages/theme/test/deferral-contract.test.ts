// Deferral contract: a component's page script must work on markup that arrives after load (a Deferred
// fragment), so it never scans `document` at the top of the script (it mounts through `onRoots`, or hands the
// work to a module that does). This test checks the scan only; deferred-contract.spec.ts proves each default
// story comes alive inside a Deferred.
// A scan inside an event handler or an `onRoots` callback runs later and is fine; the check flags only
// script-level lines (indent of two spaces or less). Chrome under starlight/ and layouts/Shell.astro
// load with their page and are out of scope.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../src/components');
const SCAN = /\b(?:document|doc)\.(?:querySelector(?:All)?|getElementById|getElementsBy\w+)(?:<[^>]*>)?\(/;
/** Eager modules a component script calls: a scan inside them runs once, at load. */
const EAGER = ['command-bar', 'number-stepper', 'logo-tile-install', 'toggle-button', 'tag-group', 'search-field'];

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

/** The script-level scans in a page script: the offending lines. */
const scans = (script: string): string[] =>
  script.split('\n').filter((line) => SCAN.test(line) && /^ {0,2}\S/.test(line));

describe('scans()', () => {
  it('flags a script-level scan, not one inside a callback', () => {
    expect(scans("  for (const r of document.querySelectorAll('.x')) go(r);")).toHaveLength(1);
    expect(scans("  const roots = [...document.querySelectorAll('.x')];")).toHaveLength(1);
    expect(scans("onRoots('.x', (r) => {\n    document.querySelector('.y');\n  });")).toHaveLength(0);
  });
});

describe('component scripts mount through onRoots', () => {
  const pages = walk(SRC)
    .filter((f) => f.endsWith('.astro'))
    .map((f) => ({
      name: relative(SRC, f),
      scripts: [...readFileSync(f, 'utf8').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1] ?? ''),
    }))
    .filter((p) => p.scripts.length > 0);

  it('finds the component scripts', () => {
    expect(pages.length).toBeGreaterThan(25);
  });

  it.each(pages.map((p) => [p.name, p] as const))('%s does not scan document at script level', (_name, page) => {
    expect(page.scripts.flatMap(scans)).toEqual([]);
  });

  // A script that mounts itself (no onRoots, so it imports no shared chunk and stays inlined) must hear the
  // announcement of inserted markup, else its components stay dead inside a Deferred fragment.
  it('Tree.astro mounts itself, listens for ocx:inserted and imports only ./tree.mjs (a shared import un-inlines it)', () => {
    const script = pages.find((p) => p.name === 'Tree.astro')?.scripts.join('\n') ?? '';
    expect([...script.matchAll(/^\s*import\b.*?from\s+'([^']+)'/gm)].map((m) => m[1])).toEqual(['./tree.mjs']);
    expect(script).toContain("addEventListener('ocx:inserted'");
  });

  it.each(EAGER)('%s.mjs does not scan the document', (name) => {
    const file = walk(SRC).find((f) => f.endsWith(`/${name}.mjs`));
    expect(file, name).toBeDefined();
    const src = readFileSync(file!, 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    expect(src.filter((l) => SCAN.test(l))).toEqual([]);
  });
});
