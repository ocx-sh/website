// WP13.4 PlatformIcons on its story pages (installation.md's shells table).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const STORY = '/docs/stories/platform-icons/';
const PAGE = `${STORY}default/`; // the shells table
const ARCHIVES = `${STORY}release-archives/`;
const UNKNOWN = `${STORY}unknown-operating-system/`;

test.describe('WP13.4 PlatformIcons', () => {
  test('WP13.4 PlatformIcons: the shells table shows one named glyph per OS per row (9d81ae9f8)', async ({ page }) => {
    await page.goto(PAGE);
    const rows = page.locator('table', { hasText: 'Installer URL' }).locator('tbody tr');
    await expect(rows).toHaveCount(5);
    const posix = rows.filter({ hasText: 'POSIX' });
    await expect(posix.getByRole('img', { name: 'Linux', exact: true })).toBeVisible();
    await expect(posix.getByRole('img', { name: 'macOS', exact: true })).toBeVisible();
    await expect(posix.getByRole('img', { name: 'Windows', exact: true })).toHaveCount(0);
    const pwsh = rows.filter({ hasText: 'PowerShell' }).locator('.ocx-platform');
    // Canonical order regardless of prop order ['windows', 'linux', 'darwin'].
    expect(await pwsh.evaluateAll((els) => els.map((el) => el.getAttribute('data-os')))).toEqual([
      'linux',
      'darwin',
      'windows',
    ]);
  });

  test('WP13.4 PlatformIcons: the tooltip is the native title attribute (9d81ae9f8)', async ({ page }) => {
    await page.goto(PAGE);
    const linux = page.locator('table .ocx-platform[data-os="linux"]').first();
    await expect(linux).toHaveAttribute('title', 'Linux');
  });

  test('WP13.4 PlatformIcons: glyphs fill with currentColor, so they follow the text colour in both schemes (9d81ae9f8)', async ({
    page,
  }) => {
    await page.goto(PAGE);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      const [color, fill] = await page
        .locator('table .ocx-platform[data-os="linux"]')
        .first()
        .evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.querySelector('path')!).fill]);
      expect(fill, theme).toBe(color);
    }
  });

  test('WP13.4 PlatformIcons: hovering a glyph shifts its colour (9d81ae9f8)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'hover-only affordance; touch has no hover');
    await page.goto(PAGE);
    const icon = page.locator('table .ocx-platform[data-os="darwin"]').first();
    const before = await icon.evaluate((el) => getComputedStyle(el).color);
    await icon.hover();
    await expect.poll(() => icon.evaluate((el) => getComputedStyle(el).color)).not.toBe(before);
  });

  test('WP13.4 PlatformIcons: fades in without a motion preference (9d81ae9f8)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(PAGE);
    const name = await page
      .locator('.ocx-platform')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).not.toBe('none');
  });

  test('WP13.4 PlatformIcons: no fade-in under prefers-reduced-motion: reduce (WP13.4)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(PAGE);
    const name = await page
      .locator('.ocx-platform')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
  });

  test('WP13.4 PlatformIcons: os-arch mode shows OS names and architecture chips (9d81ae9f8)', async ({ page }) => {
    await page.goto(ARCHIVES);
    const list = page.locator('.ocx-platforms[data-mode="os-arch"]');
    const linux = list.locator('.ocx-platform[data-os="linux"]');
    await expect(linux.locator('.ocx-platform__name')).toHaveText('Linux');
    await expect(linux.locator('.ocx-platform__arch')).toHaveText(['amd64', 'arm64']);
    await expect(list.getByRole('img', { name: 'Windows (amd64)' })).toBeVisible();
  });

  test('WP13.4 PlatformIcons: an unknown OS renders its name as a text fallback (9d81ae9f8)', async ({ page }) => {
    await page.goto(UNKNOWN);
    const bsd = page.getByRole('img', { name: 'freebsd (amd64)' });
    await expect(bsd).toBeVisible();
    await expect(bsd).toContainText('freebsd');
  });

  for (const theme of ['light', 'dark']) {
    test(`WP13.4 PlatformIcons: axe reports no violations on every story (${theme})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const path of [PAGE, ARCHIVES, UNKNOWN]) {
        await page.goto(path);
        await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
        await settle(page); // axe must read final colours, not a theme crossfade
        const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
        expect(violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
          [],
        );
      }
    });
  }

  test('WP14c PlatformIcons: arch chips wear the neutral label Tag (same box as the status page Tag)', async ({
    page,
  }) => {
    const look = (l: ReturnType<typeof page.locator>) =>
      l.evaluate((e) => {
        const c = getComputedStyle(e);
        return [
          c.backgroundColor,
          c.color,
          c.fontFamily,
          c.fontSize,
          c.paddingTop,
          c.paddingLeft,
          c.borderTopLeftRadius,
        ];
      });
    await page.goto('/docs/stories/tag/states/');
    const want = await look(page.locator('main .ocx-ui-tag[data-variant="label"][data-tone="neutral"]').first());
    await page.goto(ARCHIVES);
    expect(await look(page.locator('.ocx-platform__arch').first())).toEqual(want);
  });
});
