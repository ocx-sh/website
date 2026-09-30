// C-023, C-130e: axe reports no violations with the ecosystem menu open, on each hub.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const path of ['/docs/', '/docs/components/code/']) {
  test(`C-023 axe reports no violations with the ecosystem menu open (${path})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'menu trigger is hidden at ≤ 640px; see mobile.spec.ts');
    await page.goto(path);
    await page.locator('.ocx-header__nav button[data-ocx-section="ecosystem"]').click();
    await expect(page.locator('#ocx-ecosystem-menu')).toBeVisible();
    for (const hub of ['integrations', 'apps']) {
      await page.locator('#ocx-ecosystem-menu').getByRole('tab', { name: hub, exact: true }).click();
      await expect(page.locator(`.ocx-mega__panel[data-ocx-hub="${hub}"]`)).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}
