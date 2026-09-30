// WP14a form primitives on their story pages (stories/{button,input,choice,radio-group}/, C-125):
// axe in both schemes, keyboard focus ring, field focus border. The doc pages keep their headings.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { computed, resolve } from './tokens.ts';

const DOC = {
  Button: '/docs/components/button/',
  Input: '/docs/components/input/',
  Choice: '/docs/components/choice/',
};
const story = (slug: string, name: string) => `/docs/stories/${slug}/${name}/`;
// `default` is the page's first Demo; `states` its States section (the naming contract).
const PAGE = {
  Button: story('button', 'default'),
  Input: story('input', 'default'),
  Choice: story('choice', 'default'),
};
const STATES = {
  Button: story('button', 'states'),
  Input: story('input', 'states'),
  Choice: story('choice', 'states'),
};

test.describe('WP14a form primitives', () => {
  test('WP14a form: the showcase renders every Button variant, an Input and every Choice type', async ({ page }) => {
    await page.goto(PAGE.Button);
    for (const v of ['primary', 'secondary', 'ghost'])
      await expect(page.locator(`.ocx-ui-button[data-variant="${v}"]`).first()).toBeVisible();
    await page.goto(PAGE.Input);
    await expect(page.locator('.ocx-ui-input').first()).toBeVisible();
    await page.goto(PAGE.Choice);
    for (const t of ['checkbox', 'switch'])
      await expect(page.locator(`.ocx-ui-choice[data-type="${t}"]`).first()).toBeVisible();
    await expect(page.getByRole('switch').first()).toBeVisible();
    // Radios are shown as a group (Z5: RadioGroup wears the Choice radio look).
    await page.goto(story('radio-group', 'default'));
    await expect(page.locator('.ocx-ui-choice[data-type="radio"]').first()).toBeVisible();
  });

  test('WP14a form: every primitive has a section showing its states (default, disabled, error, focus note)', async ({
    page,
  }) => {
    const main = page.locator('main');
    for (const [h, path] of Object.entries(DOC)) {
      await page.goto(path);
      await expect(main.getByRole('heading', { level: 1, name: h, exact: true })).toBeVisible();
    }
    await page.goto(DOC.Button);
    await expect(main).toContainText(/focus/i); // the focus/hover note
    await page.goto(STATES.Button);
    await expect(main.locator('.ocx-ui-button[disabled]').first()).toBeVisible();
    for (const size of ['s', 'm', 'l'])
      await expect(main.locator(`.ocx-ui-button[data-size="${size}"]`).first()).toBeVisible();
    await page.goto(PAGE.Button); // the icon-only button lives in the default story
    await expect(main.locator('.ocx-ui-button[data-icon-only][aria-label]').first()).toBeVisible();
    await page.goto(STATES.Input);
    await expect(main.locator('.ocx-ui-input[disabled]').first()).toBeVisible();
    await expect(main.locator('.ocx-ui-input[aria-invalid="true"]').first()).toBeVisible();
    await expect(main.locator('.ocx-ui-field:not([data-invalid]) .ocx-ui-field__msg').first()).toBeVisible(); // hint
    await page.goto(STATES.Choice);
    await expect(main.locator('.ocx-ui-choice__input[disabled]').first()).toBeAttached();
    await expect(main.locator('.ocx-ui-choice__input[checked]').first()).toBeAttached();
  });

  for (const theme of ['light', 'dark'])
    for (const [label, pages] of [
      ['default', PAGE],
      ['states', STATES],
    ] as const)
      for (const [name, path] of Object.entries(pages))
        test(`WP14a form: axe reports no violations on the ${name} ${label} story (${theme})`, async ({ page }) => {
          await page.goto(path);
          await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
          const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
          expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        });

  test('WP14a form: a keyboard-focused Button shows the focus ring (--ocx-focus-ring, --ocx-focus-offset)', async ({
    page,
  }) => {
    await page.goto(PAGE.Button);
    const button = page.locator('main button.ocx-ui-button:not([disabled])').first();
    await button.focus(); // programmatic focus after no pointer input matches :focus-visible in Chromium
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    for (const part of ['outline-style', 'outline-width', 'outline-color'])
      expect(await computed(button, part), part).toBe(await resolve(page, 'outline', 'var(--ocx-focus-ring)', part));
    expect(await computed(button, 'outline-offset')).toBe(
      await resolve(page, 'outline-offset', 'var(--ocx-focus-offset)'),
    );
  });

  test('WP14a form: a focused Input shows a --ocx-color-focus border and no outline ring', async ({ page }) => {
    await page.goto(PAGE.Input);
    const input = page.locator('main .ocx-ui-input:not([disabled])').first();
    const idle = await computed(input, 'border-top-color');
    await input.focus();
    const focus = await resolve(page, 'border-top-color', 'var(--ocx-color-focus)');
    await expect.poll(() => computed(input, 'border-top-color')).toBe(focus);
    expect(idle).not.toBe(focus);
    expect(await computed(input, 'outline-style')).toBe('none');
  });

  test('WP14a form: a visually hidden label still names its Input', async ({ page }) => {
    await page.goto(STATES.Input);
    const hidden = page.locator('main .ocx-ui-field__label[data-hidden]').first();
    const name = (await hidden.textContent())?.trim() ?? '';
    expect(name).not.toBe('');
    expect(await hidden.boundingBox().then((b) => (b ? b.width * b.height : 0))).toBeLessThanOrEqual(1);
    await expect(page.getByLabel(name, { exact: true }).first()).toBeVisible();
  });

  test('WP14a form: Button, Input and Choice use --ocx-* tokens that differ between schemes (dark parity)', async ({
    page,
  }) => {
    const primary = page.locator('.ocx-ui-button[data-variant="primary"]').first();
    const input = page.locator('main .ocx-ui-input').first();
    for (const theme of ['light', 'dark']) {
      await page.goto(PAGE.Button);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      expect(await computed(primary, 'background-color'), theme).toBe(
        await resolve(page, 'background-color', 'var(--ocx-color-accent)'),
      );
      await page.goto(PAGE.Input);
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      expect(await computed(input, 'background-color'), theme).toBe(
        await resolve(page, 'background-color', 'var(--ocx-color-surface)'),
      );
    }
  });
});
