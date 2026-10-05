// SearchField (C-269) on its story pages (stories/search-field/{default,states}): axe per state and scheme, clear hidden while
// empty and shown after typing, Escape and the button clear, focus border on the group, no native
// cancel glyph, and a layout that holds with images blocked.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { computed, resolve } from './tokens.ts';
import { settle } from './helpers/settle.ts';

const PAGE = '/docs/stories/search-field/default/';
const STATES = '/docs/stories/search-field/states/';
const DEMO = '#story';

for (const theme of ['light', 'dark'])
  for (const path of [PAGE, STATES])
    test(`SearchField: axe reports no violations in ${path.split('/')[4]} (${theme})`, async ({ page }) => {
      await page.goto(path);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      if (path === PAGE) await page.locator(`${DEMO} input`).fill('linux');
      const { violations } = await new AxeBuilder({ page }).include(DEMO).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

test('SearchField: the clear button is hidden while empty and shown after typing', async ({ page }) => {
  await page.goto(PAGE);
  const input = page.locator(`${DEMO} input`);
  const clear = page.locator(`${DEMO} .ocx-ui-search-field__clear`);
  await expect(clear).toBeHidden();
  await input.fill('zag');
  await expect(clear).toBeVisible();
  await expect(clear).toHaveAccessibleName('Clear Filter packages');
  await input.fill('');
  await expect(clear).toBeHidden();
  // A field that renders with a value shows it from first paint.
  await page.goto(STATES);
  await expect(
    page.locator('main .ocx-ui-search-field:has(input[value="linux"]) .ocx-ui-search-field__clear'),
  ).toBeVisible();
});

test('SearchField: the clear button empties the field, refocuses it and logs the event', async ({ page }) => {
  await page.goto(PAGE);
  const input = page.locator(`${DEMO} input`);
  await input.fill('zag');
  await page.locator(`${DEMO} .ocx-ui-search-field__clear`).click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.locator(`${DEMO} [role="log"]`)).toContainText('ocx:search-field:clear');
});

test('SearchField: Escape clears a non-empty field and does nothing on an empty one', async ({ page }) => {
  await page.goto(PAGE);
  const input = page.locator(`${DEMO} input`);
  await input.fill('zag');
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  const log = page.locator(`${DEMO} [role="log"]`);
  await expect(log).toContainText('ocx:search-field:clear');
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
});

test('SearchField: focus draws the focus colour on the group, not the input', async ({ page }) => {
  await page.goto(PAGE);
  const group = page.locator(`${DEMO} .ocx-ui-input-group`);
  const input = page.locator(`${DEMO} input`);
  const focus = await resolve(page, 'border-top-color', 'var(--ocx-color-focus)');
  expect(await computed(group, 'border-top-color')).not.toBe(focus);
  await input.focus();
  expect(await computed(group, 'border-top-color')).toBe(focus);
  expect(await computed(input, 'outline-style')).toBe('none');
});

// Chromium answers getComputedStyle(el, '::-webkit-search-*') with the input's own style, so the
// pseudo cannot be read back. Pixels can: paint the input end as built, then again with the glyph
// forced away by an unlayered rule; the two must match (the layered rule already hides it).
test('SearchField: no native cancel glyph or decoration (Chromium)', async ({ page }) => {
  await page.goto(PAGE);
  const input = page.locator(`${DEMO} input`);
  await input.fill('zag');
  await input.hover(); // Chromium paints the glyph on a hovered or focused input holding a value
  const box = (await input.boundingBox())!;
  const end = { x: box.x + box.width - 28, y: box.y, width: 28, height: box.height };
  const shot = () => page.screenshot({ clip: end, animations: 'disabled', caret: 'hide' });
  const built = await shot();
  await page.addStyleTag({
    content: '.ocx-ui-input-group__input::-webkit-search-cancel-button{-webkit-appearance:none;display:none}',
  });
  expect((await shot()).equals(built), 'pixels at the input end: as built vs glyph forced away').toBe(true);
});

test('SearchField: a disabled field disables the input and hides the clear button', async ({ page }) => {
  await page.goto(STATES);
  const field = page.locator('main .ocx-ui-search-field:has(input:disabled)');
  await expect(field.locator('input')).toBeDisabled();
  await expect(field.locator('.ocx-ui-search-field__clear')).toBeHidden();
});

test('SearchField: layout is the same with images blocked (AGENTS.md assets rule)', async ({ page, context }) => {
  const boxes = async () => {
    await page.goto(STATES);
    await page.evaluate(() => document.fonts.ready);
    return page.locator('main .ocx-ui-search-field').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round).join(',');
      }),
    );
  };
  const loaded = await boxes();
  await context.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
  expect(await boxes()).toEqual(loaded);
});

test('search-field: a readonly field keeps its value on Escape', async ({ page }) => {
  await page.goto(PAGE);
  const input = page.locator('main .ocx-ui-search-field input').first();
  await input.evaluate((el: HTMLInputElement) => {
    el.value = 'keep';
    el.readOnly = true;
  });
  await input.focus();
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('keep');
});
