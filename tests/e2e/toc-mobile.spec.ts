// The phone table of contents has no script of its own: TableOfContents.astro's entry script defines
// `mobile-starlight-toc` too (starlight/toc-elements.mjs), so a content page loads one request fewer.
import { expect, test } from '@playwright/test';

test('a content page loads 5 scripts before interaction (page, search, toc, ec, chrome)', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => r.resourceType() === 'script' && scripts.push(new URL(r.url()).pathname));
  await page.goto('/docs/probe/long/');
  await page.waitForLoadState('networkidle');
  expect(scripts, scripts.join('\n')).toHaveLength(5);
});

test.describe('phone table of contents', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('opens, shows the current heading, closes on Escape and on a link', async ({ page }) => {
    await page.goto('/docs/probe/long/');
    const toc = page.locator('mobile-starlight-toc');
    const details = toc.locator('details');
    await toc.locator('summary').click();
    await expect(details).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(details).toHaveJSProperty('open', false);
    await expect(toc.locator('summary')).toBeFocused();
    await toc.locator('summary').click();
    await toc.locator('a').nth(1).click();
    await expect(details).toHaveJSProperty('open', false);
    await expect(toc.locator('.display-current')).not.toBeEmpty();
  });
});
