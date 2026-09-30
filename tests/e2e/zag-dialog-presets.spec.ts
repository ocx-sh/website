// Dialog presets: every close emits exactly one `ocx:dialog-result` — the button's value, or
// 'dismiss' for Esc, the X button and an outside click — so a waiting caller always hears back.
import { expect, test, type Page } from '@playwright/test';

// Story pages (C-125): `default` is the ConfirmDialog demo, `states` the AlertDialog tones.
const CONFIRM = '/docs/stories/dialog-presets/default/';
const ALERTS = '/docs/stories/dialog-presets/states/';

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

async function results(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { results: unknown[] }).results = [];
    document.addEventListener('ocx:dialog-result', (e) =>
      (window as unknown as { results: unknown[] }).results.push((e as CustomEvent).detail),
    );
  });
  return () => page.evaluate(() => (window as unknown as { results: unknown[] }).results);
}

const open = async (page: Page, id: string) => {
  await page.evaluate((id) => document.dispatchEvent(new CustomEvent('ocx:dialog:open', { detail: { id } })), id);
  await expect(page.locator(`[data-zag-id="${id}"] [data-part="content"]`)).toBeVisible();
};

const CLOSES: [string, string, (page: Page, id: string) => Promise<void>][] = [
  ['confirm button', 'confirm', (p, id) => p.locator(`[data-zag-id="${id}"] [data-dialog-action="confirm"]`).click()],
  ['cancel button', 'cancel', (p, id) => p.locator(`[data-zag-id="${id}"] [data-dialog-action="cancel"]`).click()],
  ['Escape', 'dismiss', (p) => p.keyboard.press('Escape')],
  ['the X button', 'dismiss', (p, id) => p.locator(`[data-zag-id="${id}"] [data-part="close-trigger"]`).click()],
  // Zag arms its outside-pointer listener two frames and a task after opening (dismissable `defer`),
  // so a click right after the content shows can land unheard; a reader never clicks faster. Retry
  // until it closes: an unheard click emits nothing, so the one-result check still holds.
  [
    'an outside click',
    'dismiss',
    (p, id) =>
      expect(async () => {
        await p.mouse.click(5, 5);
        await expect(p.locator(`[data-zag-id="${id}"] [data-part="content"]`)).toBeHidden({ timeout: 600 });
      }).toPass(),
  ],
];

test('presets stay unhydrated until opened; only the opened one goes live', async ({ page }) => {
  await page.goto(ALERTS);
  const roots = page.locator('[data-zag-root="dialog"]');
  await expect(roots.first()).toBeAttached();
  await page.mouse.move(400, 400);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  expect(await roots.evaluateAll((els) => els.map((e) => e.getAttribute('data-zag-state')))).not.toContain('live');
  await open(page, 'alert-demo-info');
  await expect(page.locator('[data-zag-id="alert-demo-info"]')).toHaveAttribute('data-zag-state', 'live');
  await expect(page.locator('[data-zag-id="alert-demo-error"]')).toHaveAttribute('data-zag-state', 'idle');
});

for (const [how, value, close] of CLOSES) {
  test(`ConfirmDialog: closing by ${how} emits one result '${value}'`, async ({ page }) => {
    await page.goto(CONFIRM);
    const read = await results(page);
    const id = 'confirm-demo-dialog';
    await open(page, id);
    await close(page, id);
    await expect(page.locator(`[data-zag-id="${id}"] [data-part="content"]`)).toBeHidden();
    await page.waitForTimeout(100);
    expect(await read()).toEqual([{ id, value }]);
  });
}

test("AlertDialog: OK emits 'ok', Escape 'dismiss', once each", async ({ page }) => {
  await page.goto(ALERTS);
  const read = await results(page);
  const id = 'alert-demo-error';
  await open(page, id);
  await page.locator(`[data-zag-id="${id}"] [data-dialog-action="ok"]`).click();
  await open(page, id);
  await page.keyboard.press('Escape');
  await expect(page.locator(`[data-zag-id="${id}"] [data-part="content"]`)).toBeHidden();
  await page.waitForTimeout(100);
  expect(await read()).toEqual([
    { id, value: 'ok' },
    { id, value: 'dismiss' },
  ]);
});

test('alert tone icon is centred on the title line box', async ({ page }) => {
  await page.goto(ALERTS);
  await open(page, 'alert-demo-error');
  const box = (sel: string) => page.locator(`[data-zag-id="alert-demo-error"] ${sel}`).boundingBox();
  const [icon, title] = [await box('.ocx-ui-dialog__icon svg'), await box('[data-part="title"]')];
  expect(icon && title).toBeTruthy();
  expect(Math.abs(icon!.y + icon!.height / 2 - (title!.y + title!.height / 2))).toBeLessThanOrEqual(1);
});

test('confirm actions use the theme Button: secondary cancel, primary confirm, no ad-hoc colour', async ({ page }) => {
  await page.goto(CONFIRM);
  await open(page, 'confirm-demo-dialog');
  const bg = (action: string) =>
    page.locator(`[data-zag-id="confirm-demo-dialog"] [data-dialog-action="${action}"]`).evaluate((el) => ({
      variant: el.getAttribute('data-variant'),
      bg: getComputedStyle(el).backgroundColor,
    }));
  const accent = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.backgroundColor = 'var(--ocx-color-accent)';
    document.body.append(probe);
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  });
  expect(await bg('confirm')).toEqual({ variant: 'primary', bg: accent });
  expect((await bg('cancel')).variant).toBe('secondary');
});
