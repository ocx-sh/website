// Toast made a first-class component: the story pages' live buttons (toast(), the public
// API), exercised in a real browser. The C-181 toaster mechanics (auto-dismiss timing, max
// visible, focus-on-hover) already have deep coverage in zag-copy.spec.ts; this file covers what
// is new here — description, action, persistent, toast.promise, update-by-id, dismiss-by-id,
// the status glyph following an update, and the 2.5 s default for every tone.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { lifetime } from './helpers/toast.ts';

const PAGE = '/docs/stories/toast/default/';
const PROGRESS = '/docs/stories/toast/loading-with-progress/';
const region = (page: Page) => page.locator('[data-zag-root="toast"]');
const toasts = (page: Page) => region(page).locator('[data-part="root"][data-state="open"]');
const button = (page: Page, key: string) => page.locator(`[data-toast="${key}"]`);
const icon = (page: Page) => toasts(page).locator(':scope > svg');
const ring = (page: Page) => toasts(page).locator(':scope > svg.ocx-ui-progress-circle__ring');

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE);
});

test('a tone button shows a toast with its icon tone and title', async ({ page }) => {
  await button(page, 'success').click();
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toHaveAttribute('data-type', 'success');
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Saved');
});

// A short title is the case that broke: the body (not a Zag part) lacked `data-scope`, so its
// `flex: 1` never applied and the close button followed the title. Both a one-line and a
// two-line toast pin the close box to the padding inset.
for (const key of ['success', 'description', 'action']) {
  test(`close is pinned top-right at the padding inset; icon and title share its line (${key})`, async ({ page }) => {
    await button(page, key).click();
    const t = toasts(page).first();
    await expect(t).toBeVisible();
    await t.hover(); // Zag pauses on hover: the geometry must not depend on the 1 s demo lifetime
    await page.waitForTimeout(400); // past the enter transition, so boxes are final
    const box = async (sel: string) => (await t.locator(sel).boundingBox())!;
    const root = (await t.boundingBox())!;
    const close = await box('[data-part="close-trigger"]');
    const title = await box('[data-part="title"]');
    const icon = await box(':scope > svg');
    const inset = await t.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        top: parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop),
        end: parseFloat(s.borderRightWidth) + parseFloat(s.paddingRight),
      };
    });
    expect(Math.abs(root.x + root.width - inset.end - (close.x + close.width))).toBeLessThanOrEqual(2);
    expect(Math.abs(close.y - (root.y + inset.top))).toBeLessThanOrEqual(2);
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(mid(close) - mid(title))).toBeLessThanOrEqual(2); // one-line titles here
    expect(Math.abs(mid(icon) - mid(close))).toBeLessThanOrEqual(2);
    if (key === 'action') {
      const action = await box('[data-part="action-trigger"]');
      expect(Math.abs(mid(action) - mid(title))).toBeLessThanOrEqual(2);
    }
  });
}

test('a demo toast (duration 1000) lives about 1 s, not the 2.5 s default', async ({ page }) => {
  const ms = await lifetime(page, { title: 'Saved', tone: 'success', duration: 1000 });
  expect(ms).toBeGreaterThan(800);
  expect(ms).toBeLessThan(1300);
});

test('description shows under the title; absent elsewhere', async ({ page }) => {
  await button(page, 'description').click();
  await expect(toasts(page)).toHaveCount(1);
  const description = toasts(page).locator('[data-part="description"]');
  await expect(description).toBeVisible();
  await expect(description).toHaveText('Build 482 is live on ocx.sh.');
  await button(page, 'success').click(); // the first may already be gone (demo toasts live 1 s)
  await expect(toasts(page).filter({ hasText: 'Saved' })).toHaveCount(1);
  await expect(toasts(page).filter({ hasText: 'Saved' }).locator('[data-part="description"]')).toBeHidden();
});

test('an action renders its label, never auto-dismisses, and dismisses the toast when clicked', async ({ page }) => {
  await button(page, 'action').click();
  await expect(toasts(page)).toHaveCount(1);
  const trigger = toasts(page).locator('[data-part="action-trigger"]');
  await expect(trigger).toHaveText('Undo');
  await page.mouse.move(0, 0); // off the region: hovering would pause the timer anyway
  await page.waitForTimeout(3000); // past the default 2.5 s: an action toast stays (WCAG 2.2.1)
  await expect(toasts(page)).toHaveCount(1);
  await trigger.click();
  await expect(toasts(page)).toHaveCount(0);
});

test('persistent never auto-dismisses; dismiss(id) removes it', async ({ page }) => {
  await button(page, 'persistent').click();
  await expect(toasts(page)).toHaveCount(1);
  await page.waitForTimeout(3000); // past the default 2.5 s duration
  await expect(toasts(page)).toHaveCount(1);
  await button(page, 'dismiss-persistent').click();
  await expect(toasts(page)).toHaveCount(0);
});

test('toast.promise resolves the same toast from loading to success in place', async ({ page }) => {
  await button(page, 'promise').click();
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toHaveAttribute('data-type', 'loading');
  await expect(ring(page)).toHaveCount(1); // the shared ProgressCircle ring, not a registry icon
  const id = await toasts(page).getAttribute('id');
  await expect(toasts(page)).toHaveAttribute('data-type', 'success', { timeout: 4000 });
  await expect(toasts(page)).toHaveCount(1); // still one toast, not a second
  expect(await toasts(page).getAttribute('id')).toBe(id);
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Uploaded ocx.lock');
  // The status glyph follows the type: circle-check replaces the spinner's arc.
  await expect(icon(page)).toHaveCount(1);
  await expect(icon(page).locator('circle')).toHaveCount(1);
  await expect(ring(page)).toHaveCount(0);
});

test('toast.promise rejecting swaps the spinner for the error glyph', async ({ page }) => {
  await button(page, 'promise-error').click();
  await expect(toasts(page)).toHaveAttribute('data-type', 'loading');
  const spinner = await icon(page).innerHTML();
  await expect(toasts(page)).toHaveAttribute('data-type', 'error', { timeout: 4000 });
  await expect(icon(page)).toHaveCount(1);
  await expect.poll(() => icon(page).innerHTML()).not.toBe(spinner);
  await expect(icon(page).locator('circle')).toHaveCount(1); // circle-x
});

test('id lets a later call update the same toast in place', async ({ page }) => {
  await button(page, 'update').click();
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toHaveAttribute('data-type', 'loading');
  const id = await toasts(page).getAttribute('id');
  await expect(toasts(page)).toHaveAttribute('data-type', 'success', { timeout: 4000 });
  await expect(toasts(page)).toHaveCount(1);
  expect(await toasts(page).getAttribute('id')).toBe(id);
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Job complete');
  await expect(icon(page).locator('circle')).toHaveCount(1); // circle-check, not the spinner
  await expect(ring(page)).toHaveCount(0);
});

test('a loading toast shows the ring, aria-hidden, and it spins', async ({ page }) => {
  await button(page, 'update').click();
  await expect(toasts(page)).toHaveAttribute('data-type', 'loading');
  await expect(ring(page)).toHaveCount(1);
  await expect(ring(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(ring(page)).toHaveAttribute('data-state', 'indeterminate');
  const spin = () => ring(page).evaluate((el) => getComputedStyle(el).animationName);
  expect(await spin()).toContain('spin');
  // The ring turns: the computed rotation changes between two frames a moment apart.
  const angle = () => ring(page).evaluate((el) => getComputedStyle(el).rotate);
  const a = await angle();
  await page.waitForTimeout(150);
  expect(await angle()).not.toBe(a);
});

test('the ring stays still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button(page, 'update').click();
  await expect(ring(page)).toHaveCount(1);
  expect(await ring(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('the progress demo moves a determinate ring, then settles to success in place', async ({ page }) => {
  await page.goto(PROGRESS);
  await page.locator('[data-toast-progress]').click();
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toHaveAttribute('data-type', 'loading');
  const id = await toasts(page).getAttribute('id');
  await expect(ring(page)).toHaveAttribute('data-state', 'determinate');
  const fill = ring(page).locator('[data-part="fill"]');
  await expect(fill).toHaveAttribute('stroke-dasharray', '50 100', { timeout: 4000 });
  await expect(toasts(page).locator('[data-part="title"]')).toHaveText('Uploading ocx.lock (50%)');
  await expect(toasts(page)).toHaveAttribute('data-type', 'success', { timeout: 6000 });
  await expect(toasts(page)).toHaveCount(1);
  expect(await toasts(page).getAttribute('id')).toBe(id);
  await expect(ring(page)).toHaveCount(0);
  await expect(icon(page)).toHaveCount(1);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe reports no violations with a loading toast open (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(PROGRESS);
    await page.locator('[data-toast-progress]').click();
    await expect(ring(page)).toHaveAttribute('data-state', 'determinate');
    await page.waitForTimeout(400); // past the enter transition
    const { violations } = await new AxeBuilder({ page })
      .include('#story')
      .include('[data-zag-root="toast"]')
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('a toast with no duration lasts the default 2.5 s, whatever its tone', async ({ page }) => {
  // Zag's own per-type defaults are 2 s (success) and 5 s (error): neither may leak through.
  for (const tone of ['success', 'error']) {
    const ms = await lifetime(page, { title: tone, tone, id: `lifetime-${tone}` });
    expect(ms, `${tone} toast lifetime`).toBeGreaterThan(2300);
    expect(ms, `${tone} toast lifetime`).toBeLessThan(2900);
  }
});

test('stacking many at once queues past the max visible', async ({ page }) => {
  await button(page, 'stack').click();
  await expect(toasts(page)).toHaveCount(3);
  await expect(toasts(page)).toHaveCount(0, { timeout: 15_000 }); // all 5 drain in turn
});
