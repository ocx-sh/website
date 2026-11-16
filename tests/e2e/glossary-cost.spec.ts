// What the glossary costs a page before any interaction: a page that links terms loads the same scripts as a page
// that links none (the popup loader rides in the every-page script, chrome.mjs), within MAX_EXTRA_GZ bytes. A loader
// script of its own is one more request: ~350 B in Lighthouse's script count, which pushed consumer pages over the
// content cap.
import { gzipSync } from 'node:zlib';
import { expect, test, type Browser } from '@playwright/test';

/** Gzip bytes of the script bodies a page loads by the time it is idle, and how many requests that was (a cold cache each). */
async function preInteraction(browser: Browser, path: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const scripts: number[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (res) => {
    if (res.request().resourceType() === 'script' && res.ok())
      pending.push(res.body().then((body) => void scripts.push(gzipSync(body, { level: 9 }).length)));
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  await Promise.all(pending);
  const links = await page.locator('a.ocx-term').count();
  await context.close();
  return { bytes: scripts.reduce((a, b) => a + b, 0), requests: scripts.length, links };
}

const MAX_EXTRA_GZ = 100;

test('a page that links terms loads no more script than the same shape without (probe/terms vs probe/long)', async ({
  browser,
}) => {
  test.skip(test.info().project.name === 'mobile', 'the measurement is viewport-independent; desktop only');
  const without = await preInteraction(browser, '/docs/probe/long/');
  const withTerms = await preInteraction(browser, '/docs/probe/terms/');
  expect([without.links, withTerms.links > 0]).toEqual([0, true]);
  expect(withTerms.requests).toBe(without.requests);
  expect(withTerms.bytes - without.bytes).toBeLessThanOrEqual(MAX_EXTRA_GZ);
});
