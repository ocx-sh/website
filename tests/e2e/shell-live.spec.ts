// The live header (r10) in a browser, over the combined stage (playwright.config.ts `site` project) served as
// `ocx.sh` (the loader runs on ocx.sh hosts only): a page whose baked rev is older than the published one
// swaps in the live nav after load, the swapped menu (incl. the pinned "more" hub, renamed in the live
// fragment) works with pointer and keyboard, and nothing is swapped under a user mid-interaction.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const port = process.env['E2E_SITE_PORT'] ?? '4323';
const home = `http://ocx.sh:${port}/`;
const shell = new URL('../../site/dist/_shell/v1/', import.meta.url);
const published = JSON.parse(readFileSync(new URL('current.json', shell), 'utf8')) as { rev: string };
// The live fragment: the baked one with the ecosystem section and the pinned hub renamed.
const LIVE = 'aaaaaaaaaaaa';
const liveHtml = readFileSync(new URL(`${published.rev}/nav.html`, shell), 'utf8')
  .replaceAll('>solutions<', '>platform<')
  .replaceAll('>more<', '>explore<');

test.use({ launchOptions: { args: ['--host-resolver-rules=MAP ocx.sh 127.0.0.1'] }, reducedMotion: 'reduce' });

const header = (page: Page) => page.locator('.ocx-header');
const navRoot = (page: Page) => page.locator('[data-nav-rev]');
const trigger = (page: Page) => page.locator('.ocx-header__nav button[data-ocx-section="ecosystem"]');
const menu = (page: Page) => page.locator('#ocx-ecosystem-menu');
const isOpen = (page: Page) => menu(page).evaluate((el) => el.matches(':popover-open'));
const tab = (page: Page, name: string) => menu(page).getByRole('tab', { name, exact: true });

/** Opens the page with the live fragment published at LIVE; `release()` lets the pointer answer. */
async function open(page: Page, { stale = true, path = '/' } = {}) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => r.url().includes('/_shell/') && requests.push(new URL(r.url()).pathname));
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  if (stale) {
    await page.route('**/_shell/v1/current.json', async (route) => {
      await gate;
      await route.fulfill({ json: { v: 1, rev: LIVE } });
    });
    await page.route(`**/_shell/v1/${LIVE}/nav.html`, (route) =>
      route.fulfill({ body: liveHtml, contentType: 'text/html; charset=utf-8' }),
    );
  }
  await page.goto(`${home}${path.slice(1)}`, { waitUntil: 'load' });
  await expect(navRoot(page)).toHaveAttribute('data-nav-rev', published.rev);
  return { errors, requests, release };
}

test('a page that is up to date asks the pointer and stops there', async ({ page }) => {
  const { errors, requests } = await open(page, { stale: false });
  await expect.poll(() => requests).toEqual(['/_shell/v1/current.json']);
  await page.waitForTimeout(300);
  expect(requests).toEqual(['/_shell/v1/current.json']);
  await expect(navRoot(page)).toHaveAttribute('data-nav-rev', published.rev);
  expect(errors).toEqual([]);
});

test('a stale page swaps in the live nav without moving the header, and the menu works by pointer', async ({
  page,
}) => {
  const { errors, release } = await open(page);
  const before = await header(page).boundingBox();
  await expect(trigger(page)).toHaveText('solutions');
  release();
  await expect(navRoot(page)).toHaveAttribute('data-nav-rev', LIVE);
  await expect(trigger(page)).toHaveText('platform');
  expect(await header(page).boundingBox()).toEqual(before);
  await expect(page.locator('#own-search, site-search').first()).toBeAttached();

  await trigger(page).click();
  await expect.poll(() => isOpen(page)).toBe(true);
  await expect(page.locator('.ocx-header [data-zag-root="navigation-menu"]')).toHaveAttribute('data-zag-state', 'live');
  await expect(tab(page, 'integrations')).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'explore').click(); // the pinned hub, by pointer
  await expect(tab(page, 'explore')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.ocx-mega__panel[data-ocx-hub="more"]')).toBeVisible();
  await expect(page.locator('.ocx-mega__panel[data-ocx-hub="integrations"]')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('the swapped menu works by keyboard, down to the pinned hub, and Esc returns to the trigger', async ({ page }) => {
  const { errors, release } = await open(page);
  release();
  await expect(navRoot(page)).toHaveAttribute('data-nav-rev', LIVE);
  await page.locator('.ocx-header [data-ocx-section="catalog"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => isOpen(page)).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect(tab(page, 'integrations')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // vertical tabs, automatic activation
  await expect(tab(page, 'apps')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(tab(page, 'explore')).toBeFocused();
  await expect(tab(page, 'explore')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.ocx-mega__panel[data-ocx-hub="more"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(page)).toBe(false);
  await expect(trigger(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('nothing is swapped while a panel is open', async ({ page }) => {
  const { errors, requests, release } = await open(page);
  await trigger(page).click();
  await expect.poll(() => isOpen(page)).toBe(true);
  release();
  await expect.poll(() => requests).toContain(`/_shell/v1/${LIVE}/nav.html`); // the fragment was fetched and refused
  await page.waitForTimeout(300);
  await expect(navRoot(page)).toHaveAttribute('data-nav-rev', published.rev);
  await expect(trigger(page)).toHaveText('solutions');
  expect(await isOpen(page)).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect(tab(page, 'integrations')).toBeFocused();
  expect(errors).toEqual([]);
});

test('the Starlight header of a docs page swaps too, keeping its active section', async ({ page }) => {
  const { errors, release } = await open(page, { path: '/docs/' });
  release();
  await expect(navRoot(page)).toHaveAttribute('data-nav-rev', LIVE);
  await expect(trigger(page)).toHaveText('platform');
  await expect(page.locator('.ocx-header [data-ocx-section="docs"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.ocx-header site-search')).toBeAttached();
  await trigger(page).click();
  await expect.poll(() => isOpen(page)).toBe(true);
  expect(errors).toEqual([]);
});
