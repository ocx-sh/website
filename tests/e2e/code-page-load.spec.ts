// The code page's first paint: every font the head preloads is a face the page
// actually renders, so no preload steals bandwidth from the stylesheets and the
// faces the page does use (a bare `weight: 400` filter also preloaded the italics).
import { expect, test } from '@playwright/test';

test('code page preloads only upright font faces', async ({ page }) => {
  await page.goto('/docs/components/code/');
  const preloads = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((ls) => ls.map((l) => new URL((l as HTMLLinkElement).href).pathname));
  expect(preloads.length).toBeGreaterThan(0);
  const styles = await page.evaluate((hrefs) => {
    const faces = [...document.styleSheets].flatMap((s) => {
      try {
        return [...s.cssRules].filter((r): r is CSSFontFaceRule => r instanceof CSSFontFaceRule);
      } catch {
        return [];
      }
    });
    return hrefs.map(
      (h) =>
        faces.find((f) => f.style.getPropertyValue('src').includes(h))?.style.getPropertyValue('font-style') ??
        'unmatched',
    );
  }, preloads);
  expect(
    styles.every((s) => s === 'normal'),
    `preloaded faces: ${styles.join(', ')}`,
  ).toBe(true);
});
