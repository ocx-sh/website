// The outline's rows (starlight/TocList.astro): a link around its text, in the desktop outline and in the phone one.
import { expect, test } from '@playwright/test';

const LONG = '/docs/probe/long/';

test.describe('outline rows', () => {
  test('a row is a link around its text, in the desktop outline and in the phone one', async ({ page }) => {
    await page.goto(LONG);
    // The phone list is parsed in on its first open (MobileTableOfContents.astro).
    await page.evaluate(() => document.querySelector<HTMLElement>('mobile-starlight-toc summary')?.click());
    const rows = await page.evaluate(() =>
      ['starlight-toc', 'mobile-starlight-toc'].map((tag) => {
        const root = document.querySelector(tag)!;
        const links = [...root.querySelectorAll('li > a')];
        return {
          tag,
          rows: root.querySelectorAll('li').length,
          links: links.length,
          wrapped: root.querySelectorAll('a > *').length,
          styled: root.querySelectorAll('li[style], a[style]').length,
          text: links.map((a) => a.textContent),
        };
      }),
    );
    const [desktop, phone] = rows;
    expect(desktop?.rows).toBeGreaterThan(5);
    for (const r of rows) expect([r.links, r.wrapped, r.styled]).toEqual([r.rows, 0, 0]);
    expect(phone?.text).toEqual(desktop?.text);
  });
});
