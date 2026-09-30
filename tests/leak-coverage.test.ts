// C-115: every `*.zag.mjs` component has an e2e spec that calls
// `expectNoLeak` for it. A spec covers `<name>.zag.mjs` when its source calls
// `expectNoLeak(` and names `<name>.zag` (e.g. in the test title).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Component names (`tabs` for `tabs.zag.mjs`) no spec covers. */
function uncovered(zagFiles: string[], specs: string[]): string[] {
  const leakSpecs = specs.filter((s) => s.includes('expectNoLeak('));
  return zagFiles
    .map((f) => basename(f, '.zag.mjs'))
    .filter((name) => {
      const ref = new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.zag\\b`);
      return !leakSpecs.some((s) => ref.test(s));
    });
}

const files = (dir: string, suffix: string) =>
  readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith(suffix));

describe('C-115 leak coverage', () => {
  it('flags a planted *.zag.mjs without a leak spec and accepts a covered one', () => {
    const zag = ['components/tabs.zag.mjs', 'starlight/header-tabs.zag.mjs', 'ui/dialog.zag.mjs'];
    const specs = [
      "test('tabs.zag leaks nothing', async ({ page }) => { await expectNoLeak(page, cycle); });",
      '// dialog.zag is mentioned, but no leak call here',
    ];
    expect(uncovered(zag, specs)).toEqual(['header-tabs', 'dialog']);
    expect(uncovered(zag, [...specs, 'expectNoLeak( header-tabs.zag dialog.zag'])).toEqual([]);
  });

  it('every *.zag.mjs in the theme has an expectNoLeak spec', () => {
    const zag = files('packages/theme/src', '.zag.mjs');
    const specs = files('tests/e2e', '.ts').map((f) => readFileSync(join(root, 'tests/e2e', f), 'utf8'));
    expect(uncovered(zag, specs)).toEqual([]);
  });
});
