// C-113 lazy hydration: nothing loads before input. 2 s after load with no
// input, every interaction-triggered Zag root is still `idle`; a hover or focus
// makes it `live`. Each test also asserts the root count it found against the
// SSR HTML, so a renamed attribute cannot make the gate pass vacuously.
import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { examplePages } from '../budgets.mjs';
import { activate, INTERACTION_ROOT, tagRoots, ZAG_ROOT } from './helpers/zag.ts';

const PAGES = examplePages();
const RUNTIME_ROOT = `.ocx-deps tbody tr${ZAG_ROOT}`;
const SSR_ROOT = `${ZAG_ROOT}:not(${RUNTIME_ROOT})`;
const ssrRoots = (html: string) => (html.match(/\sdata-zag-root(?=[\s=>])/g) ?? []).length;

// The desktop pass is the gate; the mobile touch path is Z12's (S-102).
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

for (const path of PAGES) {
  test(`C-113 ${path}: Zag roots stay idle until a hover or focus`, async ({ page, request }) => {
    const expected = ssrRoots(await (await request.get(path)).text());
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // The SSR roots exactly; roots a component adds at runtime (the explorer's rows, C-220) are
    // counted apart: one per expandable row.
    await expect(page.locator(SSR_ROOT), `${path}: Zag roots in the DOM vs the SSR HTML`).toHaveCount(expected);
    const expandable = page.locator('.ocx-deps tbody tr[data-key]:has(button)');
    await expect(page.locator(RUNTIME_ROOT), `${path}: runtime roots`).toHaveCount(await expandable.count());
    let roots = await tagRoots(page, INTERACTION_ROOT, 'idle');
    test.info().annotations.push({
      type: 'zag-roots',
      description: `${path}: ${expected} total, ${roots.length} interaction`,
    });
    for (const [i, root] of roots.entries()) {
      await expect(root, `${path}: root ${i} before input`).toHaveAttribute('data-zag-state', 'idle');
    }
    // Either signal alone starts a root: hover on this load, focus on a fresh one.
    for (const how of ['hover', 'focus'] as const) {
      if (how === 'focus') {
        await page.reload();
        roots = await tagRoots(page, INTERACTION_ROOT, 'idle');
      }
      for (const [i, root] of roots.entries()) {
        await activate(root, how);
        await expect(root, `${path}: root ${i} after ${how}`).toHaveAttribute('data-zag-state', 'live');
      }
    }
  });
}

test('C-113 the gated pages render Zag roots once the theme ships a *.zag.mjs', async ({ request }) => {
  const zag = readdirSync(new URL('../../packages/theme/src/', import.meta.url), { recursive: true }).filter((f) =>
    String(f).endsWith('.zag.mjs'),
  );
  let total = 0;
  for (const path of PAGES) total += ssrRoots(await (await request.get(path)).text());
  test.info().annotations.push({ type: 'zag-roots', description: `${zag.length} modules, ${total} roots` });
  if (zag.length > 0)
    expect(total, `${zag.length} *.zag.mjs modules but no [data-zag-root] on any page`).toBeGreaterThan(0);
  else expect(total).toBe(0);
});
