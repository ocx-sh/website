// C-260…C-263 field primitives on their story pages (label, input-group, input): axe in both
// schemes, group focus border, addons inside the box, a ghost button fitting the H38 box, and a
// layout that is identical with images blocked.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { computed, H38, resolve, resolveBlockSize } from './tokens.ts';
import { settle } from './helpers/settle.ts';

const story = (slug: string, name: string) => `/docs/stories/${slug}/${name}/`;
// `default` is the page's first Demo, `states` its States section (the naming contract). The
// behaviour tests below run on the states stories, which hold every variant.
const PAGES = {
  Label: story('label', 'default'),
  'Label states': story('label', 'states'),
  'Input group': story('input-group', 'default'),
  'Input group states': story('input-group', 'states'),
  Input: story('input', 'default'),
  'Input states': story('input', 'states'),
};
const GROUPS = PAGES['Input group states'];
const INPUTS = PAGES['Input states'];
const GROUP = 'main .ocx-ui-input-group';

for (const theme of ['light', 'dark'])
  for (const [name, path] of Object.entries(PAGES))
    test(`field: axe reports no violations on the ${name} story (${theme})`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

test('field: the group shows the focus border when its input is focused, and no outline on the input', async ({
  page,
}) => {
  await page.goto(GROUPS);
  const group = page.locator(`${GROUP}:not([data-disabled]):not([data-invalid])`).first();
  const input = group.locator('.ocx-ui-input-group__input');
  const idle = await computed(group, 'border-top-color');
  await input.focus();
  const focus = await resolve(page, 'border-top-color', 'var(--ocx-color-focus)');
  await expect.poll(() => computed(group, 'border-top-color')).toBe(focus);
  expect(idle).not.toBe(focus);
  expect(await computed(input, 'outline-style')).toBe('none');
});

test('field: an invalid group shows the danger border until its input has focus', async ({ page }) => {
  await page.goto(GROUPS);
  const group = page.locator(`${GROUP}[data-invalid]`).first();
  const danger = await resolve(page, 'border-top-color', 'var(--ocx-color-danger)');
  expect(await computed(group, 'border-top-color')).toBe(danger);
  await group.locator('.ocx-ui-input-group__input').focus();
  const focus = await resolve(page, 'border-top-color', 'var(--ocx-color-focus)');
  await expect.poll(() => computed(group, 'border-top-color')).toBe(focus);
});

test('field: a text addon and an icon render inside the box', async ({ page }) => {
  await page.goto(GROUPS);
  for (const child of ['.ocx-ui-input-group__addon', '.ocx-icon']) {
    const group = page.locator(`${GROUP}:has(> ${child})`).first();
    const inner = group.locator(`:scope > ${child}`).first();
    await expect(inner).toBeVisible();
    const [g, c] = await Promise.all([group.boundingBox(), inner.boundingBox()]);
    expect(c && g && c.x >= g.x && c.x + c.width <= g.x + g.width, child).toBe(true);
    expect(c && g && c.y >= g.y && c.y + c.height <= g.y + g.height, child).toBe(true);
  }
  expect(await computed(page.locator(`${GROUP} > .ocx-icon`).first(), 'color')).toBe(
    await resolve(page, 'color', 'var(--ocx-color-fg-subtle)'),
  );
});

test('field: a ghost Button in the end slot fits within the --ocx-control-2xl box', async ({ page }) => {
  await page.goto(GROUPS);
  const group = page.locator(`${GROUP}:has(> .ocx-ui-button)`).first();
  const button = group.locator(':scope > .ocx-ui-button[data-variant="ghost"][data-size="s"]');
  await expect(button).toBeVisible();
  const [g, b, h38] = await Promise.all([group.boundingBox(), button.boundingBox(), resolveBlockSize(page, H38)]);
  expect(g?.height).toBeCloseTo(h38, 0);
  expect(b && b.height).toBeLessThanOrEqual(h38);
  expect(b && g && b.y >= g.y && b.y + b.height <= g.y + g.height).toBe(true);
  expect(b && g && b.x + b.width <= g.x + g.width).toBe(true);
});

/** Tag and rounded box of every rendered element under <main>, in document order. */
const layout = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main *')].flatMap((e) => {
      const r = e.getBoundingClientRect();
      return r.width || r.height ? [`${e.tagName} ${[r.x, r.y, r.width, r.height].map(Math.round).join(',')}`] : [];
    }),
  );

test.use({ reducedMotion: 'reduce' });

for (const [name, path] of Object.entries(PAGES))
  test(`field: the ${name} story looks the same with images blocked`, async ({ page, context }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const loaded = await layout(page);
    await context.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    expect(await layout(page)).toEqual(loaded);
  });

test.describe('number stepper', () => {
  const field = (page: Page) => page.locator('main .ocx-ui-field:has(input[type="number"][min="0"])').first();

  test('field: the stepper steps the input, disables at the bound, and the native spin buttons are gone', async ({
    page,
  }) => {
    await page.goto(INPUTS);
    const input = field(page).locator('input');
    const up = field(page).getByRole('button', { name: 'Increase' });
    const down = field(page).getByRole('button', { name: 'Decrease' });
    expect(await computed(input, '-webkit-appearance')).not.toBe('auto');
    await input.fill('9');
    await up.click();
    await expect(input).toHaveValue('10');
    await expect(input).toBeFocused();
    await expect(up).toBeDisabled();
    await expect(down).toBeEnabled();
    await input.fill('0');
    await expect(down).toBeDisabled();
    await expect(up).toHaveAttribute('tabindex', '-1');
  });

  test('field: the stepper sits inside the H38 box', async ({ page }) => {
    await page.goto(INPUTS);
    const group = field(page).locator('.ocx-ui-input-group');
    const [g, s, h38] = await Promise.all([
      group.boundingBox(),
      group.locator('.ocx-ui-stepper').boundingBox(),
      resolveBlockSize(page, H38),
    ]);
    expect(g?.height).toBeCloseTo(h38, 0);
    expect(s && g && s.y >= g.y && s.y + s.height <= g.y + g.height && s.x + s.width <= g.x + g.width).toBe(true);
  });
});

test.describe('forced colors', () => {
  test.use({ forcedColors: 'active' });
  test('field: a focused group draws an outline, not only a border colour', async ({ page }) => {
    await page.goto(GROUPS);
    const group = page.locator(`${GROUP}:not([data-disabled]):not([data-invalid])`).first();
    await group.locator('.ocx-ui-input-group__input').focus();
    await expect.poll(() => computed(group, 'outline-style')).toBe('solid');
    expect(parseFloat(await computed(group, 'outline-width'))).toBeGreaterThan(0);
  });
});
