// C-266 Meter on its story pages (stories/meter/{default,states}): axe per state, the fill width follows the value, and the
// label names the meter.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const DEFAULT = '/docs/stories/meter/default/';
const STATES = '/docs/stories/meter/states/';

test('C-266 axe reports no violations', async ({ page }) => {
  for (const route of [DEFAULT, STATES]) {
    await page.goto(route);
    await expect(page.locator('#story [role="meter"]').first()).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
    expect(violations.map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});

test('C-266 the fill is the value percent of the track wide, and 0 and 100 are empty and full', async ({ page }) => {
  const widths = async (name: string) => {
    const meter = page.getByRole('meter', { name }).first();
    const track = (await meter.locator('[data-part="track"]').boundingBox())!;
    const fill = (await meter.locator('[data-part="fill"]').boundingBox())!;
    return { track: track.width, fill: fill.width };
  };
  await page.goto(DEFAULT);
  const demo = await widths('Disk used');
  expect(demo.fill / demo.track).toBeCloseTo(0.62, 2);
  await page.goto(STATES);
  const forty = await widths('Cache');
  expect(forty.fill / forty.track).toBeCloseTo(0.45, 2);
  expect((await widths('Empty')).fill).toBe(0);
  const full = await widths('Full');
  expect(Math.abs(full.fill - full.track)).toBeLessThan(0.5);
});

test('C-266 a meter has a name, its value text and the range, and the tones differ in fill colour', async ({
  page,
}) => {
  await page.goto(STATES);
  const meter = page.getByRole('meter', { name: 'Storage' });
  await expect(meter).toHaveAttribute('aria-valuetext', '3.2 of 5 GB');
  await expect(meter).toHaveAttribute('aria-valuenow', '64');
  await expect(meter).toHaveAttribute('aria-valuemin', '0');
  await expect(meter).toHaveAttribute('aria-valuemax', '100');
  const fill = (name: string) =>
    page
      .getByRole('meter', { name })
      .first()
      .locator('[data-part="fill"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const colours = new Set([
    await fill('Cache'),
    await fill('Tests passing'),
    await fill('Quota'),
    await fill('Battery'),
  ]);
  expect(colours.size).toBe(4);
});

test('C-266 a hidden label still names the meter and takes no room', async ({ page }) => {
  await page.goto(STATES);
  const meter = page.getByRole('meter', { name: 'Battery' });
  await expect(meter).toHaveCount(1);
  const label = (await meter.locator('[data-part="label"]').boundingBox())!;
  expect(label.width).toBeLessThanOrEqual(1);
});

test('C-266 forced colours: the fill stays visible in system ink', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(DEFAULT);
  const fill = page.getByRole('meter', { name: 'Disk used' }).first().locator('[data-part="fill"]');
  const bg = await fill.evaluate((el) => getComputedStyle(el).backgroundColor);
  const canvas = await fill.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe(canvas);
});
