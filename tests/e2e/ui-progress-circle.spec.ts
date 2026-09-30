// C-265 ProgressCircle on its story pages (stories/progress-circle/{default,states}): axe per state, the spin (and its absence under reduced
// motion), and a determinate fill whose dash length matches its value.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Chromium serialises a calc() dash as `calc(40px), 100px`: read the leading number.
const dashLength = (s: string) => parseFloat(s.replace('calc(', ''));

const DEFAULT = '/docs/stories/progress-circle/default/';
const STATES = '/docs/stories/progress-circle/states/';
const ring = (l: import('@playwright/test').Locator) => l.locator('.ocx-ui-progress-circle__ring');

for (const state of ['determinate', 'indeterminate'] as const) {
  test(`C-265 axe reports no violations (${state})`, async ({ page }) => {
    // The default story holds only a determinate ring; the indeterminate one is in the states.
    for (const route of state === 'determinate' ? [DEFAULT, STATES] : [STATES]) {
      await page.goto(route);
      await expect(page.locator(`#story .ocx-ui-progress-circle[data-state="${state}"]`).first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
      expect(violations.map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
        [],
      );
    }
  });
}

const rotation = (l: import('@playwright/test').Locator) =>
  l.evaluate((el) => {
    const m = new DOMMatrixReadOnly(
      getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform,
    );
    return getComputedStyle(el).rotate + '|' + m.toString();
  });

test('C-265 the indeterminate ring animates', async ({ page }) => {
  await page.goto(STATES);
  const r = ring(page.locator('#story .ocx-ui-progress-circle[data-state="indeterminate"]').first());
  expect(await r.evaluate((el) => getComputedStyle(el).animationName)).toBe('ocx-ui-progress-circle-spin');
  const a = await rotation(r);
  await page.waitForTimeout(250);
  expect(await rotation(r)).not.toBe(a);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('C-265 the indeterminate ring stands still as an arc', async ({ page }) => {
    await page.goto(STATES);
    const el = ring(page.locator('#story .ocx-ui-progress-circle[data-state="indeterminate"]').first());
    expect(await el.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    const fill = el.locator('[data-part="fill"]');
    expect(dashLength(await fill.evaluate((e) => getComputedStyle(e).strokeDasharray))).toBe(25);
  });
});

test('C-265 a determinate 40 draws a 40 dash and follows --_value', async ({ page }) => {
  await page.goto(STATES);
  // A handle, not a locator: the test rewrites aria-valuenow, so the selector would re-resolve to another ring.
  const root = await page.locator('#story .ocx-ui-progress-circle[aria-valuenow="40"]').first().elementHandle();
  if (!root) throw new Error('no determinate 40 ring');
  const dash = () =>
    root
      .evaluate((e) => {
        const fill = e.querySelector('[data-part="fill"]');
        if (!fill) throw new Error('no fill');
        return getComputedStyle(fill).strokeDasharray;
      })
      .then(dashLength);
  expect(await dash()).toBe(40);
  await root.evaluate((e) => {
    e.setAttribute('aria-valuenow', '75');
    e.style.setProperty('--_value', '75');
  });
  expect(await dash()).toBe(75);
});

test('C-265 the box is reserved: size does not depend on the value', async ({ page }) => {
  await page.goto(STATES);
  const box = (sel: string) => ring(page.locator(sel).first()).boundingBox();
  const a = await box('#story .ocx-ui-progress-circle[aria-valuenow="0"]');
  const b = await box('#story .ocx-ui-progress-circle[aria-valuenow="100"]');
  expect(a?.width).toBe(b?.width);
  expect(a?.height).toBe(b?.height);
});
