// LogoTile (catalog parity D-009, D-011, D-035 to D-038): a logo that fails falls back to the
// initials, a failed logo walks to its fallback, the logo shows bare over a monogram that fades out,
// the hue follows the scheme, and the box is the same with images blocked.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { computed } from './tokens.ts';

const PAGE = '/docs/stories/logo-tile/states/';
// A 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const tile = (page: Page, label: string): Locator =>
  page
    .locator('.showcase-state')
    .filter({ has: page.locator('.showcase-state__label', { hasText: new RegExp(`^${label}$`) }) })
    .locator('.ocx-logo-tile');

test('D-009 a broken logo is hidden on the server-rendered tile, leaving the initials', async ({ page }) => {
  await page.goto(PAGE);
  const broken = tile(page, 'broken logo');
  await expect(broken).toHaveAttribute('data-state', 'fallback');
  await expect(broken.locator('img')).toBeHidden();
  await expect(broken.locator('.ocx-logo-tile__initials')).toBeVisible();
  await expect(broken.locator('.ocx-logo-tile__initials')).toHaveText('GH');
  expect(Number(await computed(broken.locator('.ocx-logo-tile__initials'), 'opacity'))).toBe(1);
});

test('D-009 D-037 a loaded logo shows bare (no background, border or radius) and the monogram steps aside', async ({
  page,
}) => {
  // No fade in flight, so the end state is read as it settles.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const ok = tile(page, 'logo');
  await expect(ok).toHaveAttribute('data-state', 'ready');
  const img = ok.locator('img');
  await expect(img).toBeVisible();
  expect(Number(await computed(img, 'opacity'))).toBe(1);
  expect(await computed(img, 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(await computed(img, 'border-top-width')).toBe('0px');
  expect(await computed(img, 'border-top-left-radius')).toBe('0px');
  expect(await computed(ok, 'background-color')).toBe('rgba(0, 0, 0, 0)');
  expect(Number(await computed(ok.locator('.ocx-logo-tile__initials'), 'opacity'))).toBe(0);
});

test('D-036 a failed logo retries its explicit fallback once, then the monogram stands', async ({ page }) => {
  await page.route('**/logo-tile-e2e/chain.svg', (r) => r.fulfill({ status: 404 }));
  await page.route('**/logo-tile-e2e/chain.png', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
  await page.route('**/logo-tile-e2e/none.*', (r) => r.fulfill({ status: 404 }));
  await page.goto(PAGE);
  const host = tile(page, 'monogram \\(no logo\\)');
  await host.evaluate((el) => {
    // A page that clones a tile in after load: no per-image listener of its own.
    for (const name of ['chain', 'none']) {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.id = name;
      const img = copy.querySelector('img')!;
      img.hidden = false;
      img.dataset['fallback'] = `/logo-tile-e2e/${name}.png`;
      img.src = `/logo-tile-e2e/${name}.svg`;
      el.after(copy);
    }
  });
  await expect(page.locator('#chain')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#chain img')).toHaveAttribute('src', '/logo-tile-e2e/chain.png');
  await expect(page.locator('#none')).toHaveAttribute('data-state', 'fallback');
  await expect(page.locator('#none img')).toBeHidden();
});

test('D-035 the logo cross-fades on the duration token, and not at all under reduced motion', async ({ page }) => {
  await page.goto(PAGE);
  const img = tile(page, 'logo').locator('img');
  expect(await computed(img, 'transition-duration')).not.toBe('0s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await computed(img, 'transition-duration')).toBe('0s');
  expect(await computed(tile(page, 'logo').locator('.ocx-logo-tile__initials'), 'transition-duration')).toBe('0s');
});

test('D-011 D-161 each hue uses its own ink, and the scheme swaps the whole set', async ({ page }) => {
  await page.goto(PAGE);
  const inks = async () => {
    const out: string[] = [];
    for (const hue of [0, 1, 2, 3])
      out.push(await computed(tile(page, `hue ${hue}`).locator('.ocx-logo-tile__initials'), 'color'));
    return out;
  };
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  const light = await inks();
  expect(new Set(light).size).toBe(4);
  expect(light[0]).toBe('rgb(197, 58, 36)');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const dark = await inks();
  expect(new Set(dark).size).toBe(4);
  expect(dark[0]).toBe('rgb(255, 133, 112)');
  // A consumer override of one token rebrands that hue alone.
  await page.addStyleTag({ content: ':root[data-theme] { --ocx-color-monogram-1: rgb(1, 2, 3); }' });
  expect((await inks())[1]).toBe('rgb(1, 2, 3)');
});

test('D-038 neither logo nor initials shows the box icon in a tile, not an empty square', async ({ page }) => {
  await page.goto(PAGE);
  const empty = tile(page, 'neither logo nor initials');
  await expect(empty).toHaveAttribute('data-state', 'empty');
  await expect(empty.locator('.ocx-logo-tile__cube svg[data-icon="box"]')).toBeVisible();
  await expect(empty.locator('.ocx-logo-tile__initials')).toBeHidden();
});

test('D-035 the box is the same with images blocked, and the initials are painted either way', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const boxes = async () => {
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(() =>
      [...document.querySelectorAll('.ocx-logo-tile')].map((t) => {
        const r = t.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round).join(',');
      }),
    );
  };
  const loaded = await boxes();
  expect(loaded.length).toBeGreaterThan(8);
  await context.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
  expect(await boxes()).toEqual(loaded);
  await expect(tile(page, 'monogram \\(no logo\\)').locator('.ocx-logo-tile__initials')).toBeVisible();
});

test('D-009 the code a page loads before input is the image listener only: the fill and monogram code is not in any script', async ({
  page,
}) => {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => r.request().resourceType() === 'script' && bodies.push(r.text()));
  await page.goto(PAGE);
  await page.waitForLoadState('networkidle');
  const inline = await page.locator('script:not([src])').allTextContents();
  const scripts = [...inline, ...(await Promise.all(bodies))];
  expect(
    scripts.some((s) => s.includes('ocx-logo-tile__image')),
    'the image listener is on the page',
  ).toBe(true);
  // fillLogoTile (a recycled tile) and the monogram functions write the initials and the hue.
  expect(scripts.filter((s) => s.includes('ocx-logo-tile__initials'))).toEqual([]);
});
