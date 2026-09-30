// C-125 stories: the component page's canvases (lazy iframes on story pages) and their no-JS toolbar
// (D-SB3), the story page's head (D-SB8), its live theme (D-SB4), and every story's fixed height
// (D-SB11). Desktop chromium; the height check sets its own viewport.
import { expect, test, type Frame, type Page } from '@playwright/test';
import { examplePages } from '../budgets.mjs';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const DOC = '/docs/components/tabs/';
const STORY = '/docs/stories/tabs/default/';
const figure = (page: Page) => page.locator('#story-default');
const canvas = (page: Page) => figure(page).locator('.story__stage iframe');

/** The canvas frame once its document (any `?theme`) has loaded its story. */
async function canvasFrame(page: Page, query = ''): Promise<Frame> {
  await canvas(page).scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.frame({ name: 'c-tabs-default' })?.url() ?? '')
    .toMatch(new RegExp(`${STORY.replaceAll('/', '\\/')}${query.replace('?', '\\?')}$`));
  const frame = page.frame({ name: 'c-tabs-default' });
  if (!frame) throw new Error('no canvas frame');
  await frame.waitForLoadState();
  return frame;
}
const theme = (frame: Frame) => frame.evaluate(() => document.documentElement.dataset['theme']);

test.describe('component page canvases', () => {
  test('the canvas loads its story page', async ({ page }) => {
    await page.goto(DOC);
    await expect(canvas(page)).toHaveAttribute('loading', 'lazy');
    const frame = await canvasFrame(page);
    await expect(frame.locator('#story [data-zag-root="tabs"]')).toBeVisible();
    await expect(frame.locator('#code')).toBeHidden();
  });

  test('Dark repaints the canvas, 390 resizes it, Open leaves in a new tab', async ({ page }) => {
    await page.goto(DOC);
    await canvasFrame(page);
    await figure(page).getByRole('link', { name: 'Dark', exact: true }).click();
    expect(await theme(await canvasFrame(page, '?theme=dark'))).toBe('dark');
    await figure(page).getByRole('link', { name: 'Light', exact: true }).click();
    expect(await theme(await canvasFrame(page, '?theme=light'))).toBe('light');

    await figure(page).getByRole('radio', { name: '390' }).check();
    await expect.poll(async () => (await canvas(page).boundingBox())?.width).toBe(390);
    await figure(page).getByRole('radio', { name: 'Full' }).check();
    await expect.poll(async () => (await canvas(page).boundingBox())?.width).toBeGreaterThan(390);

    const open = figure(page).getByRole('link', { name: 'Open in a new tab' });
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('rel', /\bnoopener\b/);
    await expect(open).toHaveAttribute('href', STORY);
  });

  test('Code loads the story page at #code: the code shows, the story does not', async ({ page }) => {
    await page.goto(DOC);
    const details = figure(page).locator('details.story__code');
    await details.locator('summary').click();
    const iframe = details.locator('iframe');
    await iframe.scrollIntoViewIfNeeded();
    const code = page.frameLocator('#story-default details iframe');
    await expect(code.locator('#code')).toBeVisible();
    await expect(code.locator('#code')).toContainText('<Tabs syncKey="shell">');
    await expect(code.locator('#story')).toBeHidden();
    await expect(iframe).toHaveAttribute('src', `${STORY}#code`);
  });

  test('a canvas without ?theme follows the site theme through the storage event', async ({ page }) => {
    await page.goto(DOC);
    const frame = await canvasFrame(page);
    expect(await theme(frame)).toBe('light'); // no stored choice: the OS (light in this project)
    await page.evaluate(() => localStorage.setItem('starlight-theme', 'dark'));
    await expect.poll(() => theme(frame)).toBe('dark');
    await page.evaluate(() => localStorage.setItem('starlight-theme', 'light'));
    await expect.poll(() => theme(frame)).toBe('light');
  });

  test('with JavaScript off the canvas renders and Code opens', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(DOC);
    await canvas(page).scrollIntoViewIfNeeded();
    await expect(
      page.frameLocator('iframe[name="c-tabs-default"]').locator('#story [role="tab"]').first(),
    ).toBeVisible();
    await figure(page).locator('summary').click();
    const code = page.frameLocator('#story-default details iframe');
    await expect(code.locator('#code')).toBeVisible();
    await expect(code.locator('#story')).toBeHidden();
    await context.close();
  });
});

test.describe('story page', () => {
  test('carries a canonical link to the component page, a meta description and a title', async ({ page }) => {
    await page.goto(STORY);
    await expect(page).toHaveTitle('Shell tabs · Tabs story');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/docs\/components\/tabs\/$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test('?thumb hides the event log and the code', async ({ page }) => {
    await page.goto(`${STORY}?thumb`);
    await expect(page.locator('#story [data-zag-root="tabs"]')).toBeVisible();
    await expect(page.locator('.showcase-demo__log')).toBeHidden();
  });

  // D-SB11: `height` is the reserved canvas box at the content-column width.
  test('every story fits its declared height at 720px wide', async ({ page }) => {
    const routes = examplePages().filter((p) => p.startsWith('/docs/stories/'));
    expect(routes.length).toBeGreaterThan(0);
    const over: string[] = [];
    for (const route of routes) {
      await page.setViewportSize({ width: 720, height: 600 });
      await page.goto(route);
      const height = Number(await page.locator('html').getAttribute('data-story-height'));
      await page.setViewportSize({ width: 720, height });
      const scroll = await page.evaluate(() => document.documentElement.scrollHeight);
      if (!(height > 0) || scroll > height) over.push(`${route}: height ${height}, scrollHeight ${scroll}`);
    }
    expect(over).toEqual([]);
  });
});
