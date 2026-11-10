// Fonts: a page preloads exactly the four core files and nothing else before input; a page with a
// character outside the core set (probe/glyphs) also fetches the matching rest file and renders it in Plex.
// Files are recognised by content (sha256 from plex.generated.mjs), as the Fonts API hashes their names.
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { FILES } from '../../packages/theme/src/fonts/plex.generated.mjs';

const hashes = (part: 'core' | 'rest') =>
  new Set(
    Object.entries(FILES)
      .filter(([n]) => n.endsWith(`-${part}.woff2`))
      .map(([, f]) => f.sha256),
  );
const CORE = hashes('core');
const REST = hashes('rest');

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

/** sha256 of every font response a page load makes. */
async function fontHashes(page: Page, path: string) {
  const responses: Promise<string>[] = [];
  page.on('response', (r) => {
    if (r.request().resourceType() === 'font')
      responses.push(r.body().then((b) => createHash('sha256').update(b).digest('hex')));
  });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  return Promise.all(responses);
}

test('a content page requests exactly the four core font files before interaction', async ({ page }) => {
  const got = await fontHashes(page, '/docs/probe/long/');
  expect(got).toHaveLength(4);
  expect(new Set(got).size).toBe(4);
  for (const h of got) expect(CORE.has(h), `font ${h} is a core file`).toBe(true);
});

test('a page with a character outside the core set loads the matching rest file and renders it in Plex', async ({
  page,
}) => {
  const got = await fontHashes(page, '/docs/probe/glyphs/');
  expect(got.filter((h) => CORE.has(h))).toHaveLength(4);
  expect(got.filter((h) => REST.has(h)).length).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => document.fonts.check('16px "OCX Plex Sans Rest"', 'é'))).toBe(true);

  // Which face painted: the glyph counts per platform font. The core and the rest file both carry the
  // family name "IBM Plex Sans", so a paragraph with ASCII and é reports that one family and no system font.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const families = async (selector: string) => {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return { names: new Set(fonts.map((f) => f.familyName)), glyphs: fonts.reduce((n, f) => n + f.glyphCount, 0) };
  };
  const ascii = await families('main h1');
  const accented = await families('main .sl-markdown-content p');
  // The 600 files name their family "IBM Plex Sans SemiBold" (name ID 1) and the paragraph holds inline code
  // (Mono); a system font would not match.
  for (const name of [...ascii.names, ...accented.names]) expect(name).toMatch(/^IBM Plex (Sans|Mono)( SemiBold)?$/);
  expect(ascii.glyphs).toBeGreaterThan(0);
  expect(accented.glyphs).toBeGreaterThan(0);
});

test('a Shell page requests exactly the four core font files and no rest file', async ({ page }) => {
  const got = await fontHashes(page, '/docs/shell/');
  expect(got).toHaveLength(4);
  for (const h of got) expect(CORE.has(h), `font ${h} is a core file`).toBe(true);
  expect(got.some((h) => REST.has(h))).toBe(false);
});
