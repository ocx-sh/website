// C-101: Zag is pinned exactly, and imported only where D-Z17 allows it:
// @zag-js/vanilla in ui/zag-runtime.mjs (the glue's vanilla half), a @zag-js/<machine> in a *.zag.mjs module.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

const TIER_A = [
  'tabs',
  'collapsible',
  'accordion',
  'clipboard',
  'toast',
  'combobox',
  'select',
  'checkbox',
  'switch',
  'toggle-group',
  'menu',
  'popover',
  'dialog',
  'drawer',
  'navigation-menu',
  'tooltip',
  'tree-view',
  'toc',
  'radio-group',
  'slider',
  'tags-input',
  'pagination',
  // Z14 (Spec Delta MODIFIED Tier A): List and its async data.
  'listbox',
  'async-list',
];
const src = fileURLToPath(new URL('../src/', import.meta.url));
const deps: Record<string, string> = pkg.dependencies;

/** Every `@zag-js/*` specifier a source file loads at runtime, statically or dynamically.
 * Types are free: `import type` and JSDoc `import('…')` inside block comments are skipped. */
function zagImports(source: string): string[] {
  const runtime = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/import\s+type\s[^;]*?from\s*['"][^'"]+['"]/g, '');
  return [...runtime.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](@zag-js\/[^'"]+)['"]/g)].map((m) => m[1]!);
}

describe('C-101 Zag pin', () => {
  it.each(['vanilla', ...TIER_A])('@zag-js/%s is a dependency pinned exactly to 1.44.x', (name) => {
    expect(deps[`@zag-js/${name}`]).toMatch(/^1\.44\.\d+$/);
  });

  it('every @zag-js dependency shares one version', () => {
    const versions = new Set(
      Object.entries(deps)
        .filter(([k]) => k.startsWith('@zag-js/'))
        .map(([, v]) => v),
    );
    expect(versions.size).toBe(1);
  });

  it('D-Z17: @zag-js/vanilla only in ui/zag-runtime.mjs, a machine package only in a *.zag.mjs', () => {
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' })
      // Generated declarations (prepack's *.d.mts) are types, not runtime imports.
      .filter((f) => /\.(m?[jt]s|astro)$/.test(f) && !/\.d\.m?ts$/.test(f));
    const offenders = files.flatMap((f) => {
      const rel = relative(src, join(src, f)).split('\\').join('/');
      return zagImports(readFileSync(join(src, f), 'utf8'))
        .filter((spec) =>
          spec === '@zag-js/vanilla' ? rel !== 'components/ui/zag-runtime.mjs' : !rel.endsWith('.zag.mjs'),
        )
        .map((spec) => `${rel} imports ${spec}`);
    });
    expect(offenders).toEqual([]);
  });

  // C-113 / D-Z2: ui/zag.mjs is the every-page trigger layer. It loads zag-runtime.mjs (vanilla)
  // only dynamically, and no lazy module imports it: the bundler would merge the machines' shared
  // deps into its chunk. Lazy modules take `emit` from ui/zag-runtime.mjs.
  it('C-113: ui/zag.mjs imports the runtime only dynamically, and no lazy module imports ui/zag.mjs', () => {
    const lazy = (rel: string) => /\.zag\.mjs$|ui\/(?:zag-runtime|choice)\.mjs$/.test(rel);
    const runtime = (rel: string) =>
      readFileSync(join(src, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/import\s+type\s[^;]*?from\s*['"][^'"]+['"]/g, '');
    const offenders = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .map((f) => f.split('\\').join('/'))
      .filter(
        (rel) => lazy(rel) && /(?:from\s*|(?<!typeof\s)import\s*\(\s*)['"][^'"]*\/zag\.mjs['"]/.test(runtime(rel)),
      );
    expect(offenders).toEqual([]);
    // A dynamic import of the trigger layer makes the bundler give its chunk a namespace helper
    // chunk: one more chained request on every page (Lighthouse LCP a round trip later).
    const dynamic = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .map((f) => f.split('\\').join('/'))
      .filter(
        (rel) =>
          /\.(?:mjs|ts|astro)$/.test(rel) &&
          /(?<!typeof\s)import\s*\(\s*['"][^'"]*\/zag\.mjs['"]\s*\)(?!\.[A-Z])/.test(runtime(rel)),
      );
    expect(dynamic).toEqual([]);
    const glue = runtime('components/ui/zag.mjs');
    expect(glue).not.toMatch(/from\s*['"]\.\/zag-runtime\.mjs['"]/);
    expect(glue).toMatch(/import\(['"]\.\/zag-runtime\.mjs['"]\)/);
  });

  // C-241 adoption proof: no dead pin. Every pinned machine package is loaded at runtime by a *.zag.mjs.
  it('C-241: every pinned machine package is imported by at least one *.zag.mjs', () => {
    const used = new Set(
      readdirSync(src, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.zag.mjs'))
        .flatMap((f) => zagImports(readFileSync(join(src, f), 'utf8'))),
    );
    const pinned = Object.keys(deps).filter((k) => k.startsWith('@zag-js/') && k !== '@zag-js/vanilla');
    expect(pinned.filter((p) => !used.has(p))).toEqual([]);
  });

  it('the import scan sees static, dynamic and side-effect imports', () => {
    expect(zagImports(`import { a } from '@zag-js/tabs'; await import("@zag-js/menu"); import '@zag-js/toc';`)).toEqual(
      ['@zag-js/tabs', '@zag-js/menu', '@zag-js/toc'],
    );
    expect(zagImports(`import type { Props } from '@zag-js/tabs';\n/** @type {import('@zag-js/menu').Api} */`)).toEqual(
      [],
    );
  });
});
