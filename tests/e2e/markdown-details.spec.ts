// A Markdown <details> wears the Collapsible look (owner, 2026-10-23): on the story that renders both
// side by side, the native summary and the component's trigger match pixel for pixel, closed and open.
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const PATH = '/docs/stories/collapsible/markdown/';
const component = (page: Page) => page.locator('#story .ocx-collapsible');
const native = (page: Page) => page.locator('#story details');

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');
test.use({ reducedMotion: 'reduce' });

/**
 * Both disclosures as images, with the pointer parked outside so neither shows its hover tint. The
 * details is shot where the component was (the component hidden): an open box's fractional height
 * puts the details on another subpixel offset, which rasterizes its text one pixel off.
 */
async function shots(page: Page, info: TestInfo): Promise<[Buffer, Buffer]> {
  await page.mouse.move(0, 0);
  const shot = (root: Locator) => root.screenshot({ animations: 'disabled' });
  const first = await shot(component(page));
  await component(page).evaluate((el) => el.setAttribute('hidden', ''));
  const pair: [Buffer, Buffer] = [first, await shot(native(page))];
  await info.attach('collapsible', { body: pair[0], contentType: 'image/png' });
  await info.attach('details', { body: pair[1], contentType: 'image/png' });
  return pair;
}

test('closed, a Markdown details matches the Collapsible pixel for pixel', async ({ page }, info) => {
  await page.goto(PATH);
  const [a, b] = await shots(page, info);
  expect(b.equals(a), 'closed details differs from Collapsible').toBe(true);
});

test('open, a Markdown details matches the Collapsible pixel for pixel', async ({ page }, info) => {
  await page.goto(PATH);
  const trigger = component(page).locator('.ocx-collapsible__trigger');
  await trigger.hover();
  await trigger.click();
  await expect(component(page)).toHaveAttribute('data-state', 'open');
  await native(page).locator('summary').click();
  await expect(native(page)).toHaveAttribute('open', '');
  const [a, b] = await shots(page, info);
  expect(b.equals(a), 'open details differs from Collapsible').toBe(true);
});

test('hover tints the summary as it tints the trigger', async ({ page }) => {
  await page.goto(PATH);
  const tint = async (row: Locator) => {
    await row.hover();
    return row.evaluate((el) => getComputedStyle(el).backgroundColor);
  };
  const trigger = await tint(component(page).locator('.ocx-collapsible__trigger'));
  expect(trigger).not.toBe('rgba(0, 0, 0, 0)');
  expect(await tint(native(page).locator('summary'))).toBe(trigger);
});
