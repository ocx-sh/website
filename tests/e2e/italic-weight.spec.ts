// A page with <em> (and <strong><em>) stays within the content weight budget: the theme ships no
// italic face, so emphasis is the browser's synthesized oblique and costs no font file (#14: the
// true Plex Sans italics are ~25 KB each, enough to push a ~131 KB page over 147 KiB).
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { budgetOf } from '../budgets.mjs';

const PAGE = '/docs/probe/long/';

test('an <em> loads no italic font and the page stays within the total-byte-weight budget', async ({ page }) => {
  let bytes = 0;
  const fonts: string[] = [];
  page.on('response', async (r) => {
    const body = await r.body().catch(() => Buffer.alloc(0));
    const isFont = r.request().resourceType() === 'font';
    if (isFont) fonts.push(new URL(r.url()).pathname);
    bytes += isFont ? body.length : gzipSync(body).length; // woff2 is already compressed
  });
  await page.goto(PAGE);
  await page
    .locator('main .sl-markdown-content')
    .first()
    .evaluate((el) => {
      el.insertAdjacentHTML('beforeend', '<p><em>emphasis</em> <strong><em>strong emphasis</em></strong></p>');
    });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');

  const faces = await page.evaluate(() => [...document.fonts].map((f) => ({ style: f.style, family: f.family })));
  const { totalBytes } = budgetOf(PAGE);
  test.info().annotations.push({ type: 'weight', description: `${PAGE} with <em>: ${bytes} B of ${totalBytes} B` });
  expect.soft(bytes, `${PAGE}: ${bytes} B with <em>, budget ${totalBytes} B`).toBeLessThanOrEqual(totalBytes);
  expect
    .soft(
      faces.filter((f) => f.style !== 'normal' && !f.family.includes('Fallback')),
      'no italic face is declared',
    )
    .toEqual([]);
  const em = await page
    .locator('main em')
    .first()
    .evaluate((e) => getComputedStyle(e).fontStyle);
  expect(em, '<em> is still italic (synthesized)').toBe('italic');
  expect(fonts, 'fonts fetched').not.toEqual([]);
});
