import type { Page } from '@playwright/test';

/**
 * Re-raster the whole page before a pixel-exact first-paint compare: Chromium repaints only the
 * invalidated rect of a removed hover tint or focus ring, and anti-aliases round corners and SVG
 * strokes there a shade differently from a full paint of the identical DOM and styles. A 1px
 * width nudge is not enough: a page whose column does not move keeps its raster tiles. Halving the
 * width reflows everything (past the sidebar breakpoint), so the way back is a full paint. The
 * gate compares state, not raster history.
 */
export async function repaint(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp) return;
  await page.setViewportSize({ ...vp, width: Math.round(vp.width / 2) });
  await page.setViewportSize(vp);
  // A story page's fixed-width canvas does not reflow at half width, so its tiles survive the nudge:
  // dropping the root box forces the full paint there too.
  await page.evaluate(() => {
    const { style } = document.documentElement;
    style.display = 'none';
    void document.documentElement.offsetHeight;
    style.display = '';
  });
}
