// ToggleGroup and Select setters (D-047) on their set-from-code story pages: `ocx:toggle-group:set` /
// `ocx:select:set` move the value before the machine has started and after, and log no change event;
// a visitor's own pick still does.
import { expect, test } from '@playwright/test';

const GROUP = '/docs/stories/toggle-group/set-from-code/';
const SELECT = '/docs/stories/select/set-from-code/';
const LOG = '#story [role="log"]';

test('ToggleGroup set: moves the pressed item before the machine starts and after, with no change event', async ({
  page,
}) => {
  await page.goto(GROUP);
  const root = page.locator('#story [data-zag-root="toggle-group"]');
  const pressed = root.locator('[aria-checked="true"]');
  await expect(root).toHaveAttribute('data-zag-state', 'idle');
  await page.getByRole('button', { name: 'Set linux' }).click();
  await expect(root).toHaveAttribute('data-zag-state', 'idle');
  await expect(pressed).toHaveText('linux');
  // The machine that starts now boots from the set value.
  await root.getByRole('radio', { name: 'macos' }).hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
  await expect(pressed).toHaveText('linux');
  await page.getByRole('button', { name: 'Set windows' }).click();
  await expect(pressed).toHaveText('windows');
  await expect(page.locator(LOG)).not.toContainText('ocx:toggle-group:change');
  await root.getByRole('radio', { name: 'macos' }).click();
  await expect(pressed).toHaveText('macos');
  await expect(page.locator(LOG)).toContainText('ocx:toggle-group:change');
});

test('Select set: moves the chosen option before the machine starts and after, with no change event', async ({
  page,
}) => {
  await page.goto(SELECT);
  const root = page.locator('#story [data-zag-root="select"]');
  const shown = root.locator('[data-part="value-text"]');
  await expect(root).toHaveAttribute('data-zag-state', 'idle');
  await page.getByRole('button', { name: 'Set updated' }).click();
  await expect(root).toHaveAttribute('data-zag-state', 'idle');
  await expect(shown).toHaveText('Updated');
  await expect(root.locator('select')).toHaveValue('updated');
  await root.locator('[data-part="trigger"]').hover();
  await expect(root).toHaveAttribute('data-zag-state', 'live');
  await expect(shown).toHaveText('Updated');
  await page.getByRole('button', { name: 'Set rating' }).click();
  await expect(shown).toHaveText('Rating');
  await expect(root.locator('select')).toHaveValue('rating');
  await expect(page.locator(LOG)).not.toContainText('ocx:select:change');
  await root.locator('[data-part="trigger"]').click();
  await page.getByRole('option', { name: 'Name' }).click();
  await expect(shown).toHaveText('Name');
  await expect(page.locator(LOG)).toContainText('ocx:select:change');
});
