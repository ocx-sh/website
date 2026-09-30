// C-028: cascade probe, real Chrome, on the built example. Each case gets a
// fresh `page` (Playwright's default: a new page per test) so no case can
// leak computed-style state into the next.
//
// "Theme beats Starlight" target: the first content panel's padding-top.
//   - Theme (starlight.css, `@layer ocx`):
//     `main > .content-panel:first-child { padding-top: var(--ocx-space-8) }` -> 40px.
//   - Starlight (ContentPanel.astro): `.content-panel { padding: 1.5rem ... }` -> 24px.
//   Both differ from the UA default (0), so the winner is visible in the value.
//
// Consumer-override target: the page header (`header.header`).
//   - Theme (packages/theme/src/starlight/starlight.css, `@layer ocx`):
//     `header.header { ...; background: none; ... }` -> transparent.
//   - Starlight itself (@astrojs/starlight PageFrame.astro,
//     `@layer starlight.core`, registered BEFORE `@layer ocx`):
//     `.header { ...; background-color: var(--sl-color-bg-nav); ... }`.
//   - The probe page (examples/starlight/src/content/docs/probe/cascade.mdx)
//     adds its own UNLAYERED `header.header { background-color: rgb(4, 5, 6); }`,
//     which beats `@layer ocx` too — so "theme vs Starlight" is asserted on
//     any OTHER page, where the probe's override isn't present.
import { expect, test } from '@playwright/test';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

test('C-028 a theme rule beats a Starlight rule on the same property', async ({ page }) => {
  // 40px is the theme's value; Starlight's would be 24px, the UA's 0px.
  await page.goto('/docs/');
  await expect(page.locator('main > .content-panel').first()).toHaveCSS('padding-top', '40px');
});

test('C-028 an unlayered consumer rule beats the theme rule', async ({ page }) => {
  await page.goto('/docs/probe/cascade/');
  await expect(page.locator('header.header')).toHaveCSS('background-color', 'rgb(4, 5, 6)');
});

// Proves the case above is not vacuously green: inverting the expectation on
// the same real probe assertion must fail. test.fail() marks this test as
// expected-to-fail, so a real failure here is a PASS in the report; a bug
// that made the inversion also succeed would surface as an "unexpected pass".
test.fail('C-028 an inverted expectation fails when inverted', async ({ page }) => {
  await page.goto('/docs/probe/cascade/');
  await expect(page.locator('header.header')).toHaveCSS('background-color', TRANSPARENT);
});

test('C-028 a dead-selector control stays at its UA value', async ({ page }) => {
  await page.goto('/docs/probe/cascade/');
  await expect(page.locator('.probe-dead-selector-control')).toHaveCSS('background-color', TRANSPARENT);
});
