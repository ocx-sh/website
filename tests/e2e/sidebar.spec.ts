// C-230 / S-109: the sidebar's nested groups on Zag collapsible, persisted as Starlight does.
// The probe pages carry a nested sidebar (examples/starlight/src/probe-sidebar.ts), after the
// example's own top-level "Components" group: the flat top-level group "Probes" holds "Fixtures"
// (the probe pages, so open on them), "Gallery" (collapsed) and, inside it, "Deep" (collapsed). Desktop only: below 50em the sidebar is the
// mobile menu, where Starlight restores no open state (mobile.spec.ts).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.skip(({ isMobile }) => isMobile, 'desktop sidebar (≥ 50em) only');

const LONG = '/docs/probe/long/';
const PANE = '#starlight__sidebar';
const group = (page: Page, name: string) =>
  page.locator(`${PANE} [data-zag-root="collapsible"]`).filter({
    has: page.locator(':scope > [data-part="trigger"]', { hasText: name }),
  });
const trigger = (page: Page, name: string) => group(page, name).locator(':scope > [data-part="trigger"]');
const content = (page: Page, name: string) => group(page, name).locator(':scope > [data-part="content"]');

test('C-230: flat top level, nested groups on collapsible, SSR open state and aria-current', async ({ page }) => {
  await page.goto(LONG);
  await expect(page.locator(`${PANE} details`)).toHaveCount(0);
  // The example's own grouped "Components" sidebar (C-120) comes first, then the probe group.
  await expect(page.locator(`${PANE} .top-level > li > .group-label`)).toHaveText(['Components', 'Probes']);
  await expect(trigger(page, 'Fixtures')).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger(page, 'Gallery')).toHaveAttribute('aria-expanded', 'false');
  await expect(content(page, 'Gallery')).toBeHidden();
  await expect(page.locator(`${PANE} sl-sidebar-state-persist a[aria-current="page"]`)).toHaveAttribute('href', LONG);
  await expect(group(page, 'Gallery')).toHaveAttribute('data-zag-state', 'idle');
});

test('C-230 APG disclosure: a click before start opens on that click; Enter and Space toggle', async ({ page }) => {
  await page.goto(LONG);
  await trigger(page, 'Gallery').click();
  await expect(group(page, 'Gallery')).toHaveAttribute('data-zag-state', 'live');
  await expect(trigger(page, 'Gallery')).toHaveAttribute('aria-expanded', 'true');
  await expect(content(page, 'Gallery').getByRole('link', { name: 'Components' })).toBeVisible();

  await trigger(page, 'Deep').focus();
  await expect(group(page, 'Deep')).toHaveAttribute('data-zag-state', 'live');
  await page.keyboard.press('Enter');
  await expect(trigger(page, 'Deep')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(trigger(page, 'Deep')).toHaveAttribute('aria-expanded', 'false');
  await expect(content(page, 'Deep')).toBeHidden();
});

test('S-109: an expanded group and the scroll position come back on the next page before first paint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 260 });
  await page.goto(LONG);
  await trigger(page, 'Gallery').click();
  await expect(trigger(page, 'Gallery')).toHaveAttribute('aria-expanded', 'true');
  const scroll = await page.locator(PANE).evaluate((el) => ((el.scrollTop = el.scrollHeight), el.scrollTop));
  expect(scroll, 'the pane scrolls at this height').toBeGreaterThan(0);

  // The first frame that has the group records what it shows: the state is final before paint.
  await page.addInitScript(() => {
    const w = window as unknown as { __first?: string };
    const frame = () => {
      const t = [...document.querySelectorAll('#starlight__sidebar [data-part="trigger"]')].find((el) =>
        el.textContent.includes('Gallery'),
      );
      if (t) w.__first = t.getAttribute('aria-expanded') ?? '';
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  // A navigation, not a click on the link: scrolling the link into view would move the pane.
  await page.goto('/docs/probe/cascade/');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __first?: string }).__first)).toBe('true');
  // Restored by the pre-paint script, not by a started machine.
  await expect(group(page, 'Gallery')).toHaveAttribute('data-zag-state', 'idle');
  await expect(content(page, 'Gallery')).toBeVisible();
  expect(await page.locator(PANE).evaluate((el) => el.scrollTop)).toBe(scroll);

  // Collapsing is remembered too; the current page's own group opens by SSR regardless.
  await trigger(page, 'Gallery').click();
  await expect(trigger(page, 'Gallery')).toHaveAttribute('aria-expanded', 'false');
  await page.goto(LONG);
  await expect(trigger(page, 'Gallery')).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger(page, 'Fixtures')).toHaveAttribute('aria-expanded', 'true');
});

test('C-230: axe reports no violations with every group open', async ({ page }) => {
  await page.goto(LONG);
  for (const name of ['Gallery', 'Deep']) {
    await trigger(page, name).click();
    await expect(trigger(page, name)).toHaveAttribute('aria-expanded', 'true');
  }
  const { violations } = await new AxeBuilder({ page }).include(PANE).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test.describe('C-230 JS off', () => {
  test.use({ javaScriptEnabled: false });
  test('every nested group is shown, so every page stays reachable', async ({ page }) => {
    await page.goto(LONG);
    await expect(content(page, 'Gallery').getByRole('link', { name: 'Components' })).toBeVisible();
    await expect(content(page, 'Deep').getByRole('link', { name: 'Index' })).toBeVisible();
  });
});

test('C-230: the collapsible chunk fails → closed groups show their links (no page becomes unreachable)', async ({
  page,
}) => {
  await page.route(/collapsible\.zag/, (route) => route.abort());
  await page.goto(LONG);
  await expect(content(page, 'Gallery')).toBeHidden();
  await trigger(page, 'Gallery').hover();
  await expect(group(page, 'Gallery')).toHaveAttribute('data-zag-state', 'error');
  await expect(content(page, 'Gallery').getByRole('link', { name: 'Components' })).toBeVisible();
});

test('C-130c: first paint is final: the groups (restored state included) look the same idle and live', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // A stored state to restore: Gallery opened on the long page.
  await page.goto(LONG);
  await trigger(page, 'Gallery').click();
  await expect(trigger(page, 'Gallery')).toHaveAttribute('aria-expanded', 'true');
  const shot = async () => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page.locator(`${PANE} .top-level`).screenshot({ animations: 'disabled' });
  };
  await page.route(/collapsible\.zag/, (route) => route.abort());
  await page.goto('/docs/probe/cascade/');
  const before = await shot();
  await page.unroute(/collapsible\.zag/);
  await page.reload();
  for (const name of ['Fixtures', 'Gallery', 'Deep']) {
    await group(page, name).dispatchEvent('pointerenter');
    await expect(group(page, name)).toHaveAttribute('data-zag-state', 'live');
  }
  await page.mouse.move(1000, 700);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect((await shot()).equals(before), 'the sidebar differs between first paint and live').toBe(true);
});
