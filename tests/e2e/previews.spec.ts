// The live-previews page links out: one card per preview site, each to its planned subdomain, marked pending.
import { expect, test } from '@playwright/test';
import { SITES, previewUrl } from '../../scripts/previews/sites.mjs';

test('live previews: one external link card per site, hosting marked pending', async ({ page }) => {
  await page.goto('/docs/previews/');
  const cards = page.locator('main .ocx-card');
  await expect(cards).toHaveCount(SITES.length);
  for (const site of SITES) {
    const card = cards.filter({ hasText: site.title });
    const link = card.getByRole('link', { name: site.title });
    await expect(link).toHaveAttribute('href', previewUrl(site));
    await expect(link.locator('.ocx-ui-link__end')).toHaveCount(1);
    await expect(card).toContainText('hosting pending');
  }
});
