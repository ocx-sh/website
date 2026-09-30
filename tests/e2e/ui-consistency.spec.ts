// WP14a cross-component consistency: every control box reads the same tokens. Expected values are
// resolved in the page from the tokens (never hardcoded px). WP14c extends CONTROLS with the
// DependencyExplorer search and licence select.
import { expect, test, type Page } from '@playwright/test';
import { computed, H38, resolve, resolveBlockSize } from './tokens.ts';

interface Control {
  name: string;
  /** Navigates and returns the locator of the element that carries the box. */
  open: (page: Page) => Promise<ReturnType<Page['locator']>>;
  font: 'var(--ocx-font-mono)' | 'var(--ocx-font-sans)';
}

const CONTROLS: Control[] = [
  {
    name: 'Button m',
    font: 'var(--ocx-font-sans)',
    open: async (page) => {
      await page.goto('/docs/stories/button/default/');
      return page.locator('#story .ocx-ui-button[data-size="m"]:not([data-variant="ghost"])').first();
    },
  },
  {
    name: 'Input',
    font: 'var(--ocx-font-mono)',
    open: async (page) => {
      await page.goto('/docs/stories/input/default/');
      return page.locator('#story .ocx-ui-input').first();
    },
  },
  {
    name: 'Select control',
    font: 'var(--ocx-font-mono)',
    open: async (page) => {
      await page.goto('/docs/stories/select/default/');
      return page.locator('#story .ocx-ui-select__control').first();
    },
  },
  {
    name: 'DependencyExplorer search',
    font: 'var(--ocx-font-mono)',
    open: async (page) => {
      await page.goto('/docs/stories/dependency-explorer/default/');
      // A SearchField: the box is its InputGroup; the searchbox inside it draws no border.
      return page
        .locator('.ocx-deps .ocx-ui-input-group')
        .filter({ has: page.getByRole('searchbox', { name: 'Search dependencies' }) })
        .first();
    },
  },
  {
    name: 'DependencyExplorer licence select',
    font: 'var(--ocx-font-mono)',
    open: async (page) => {
      await page.goto('/docs/stories/dependency-explorer/default/');
      return page.locator('.ocx-deps').first().getByRole('combobox', { name: 'License' });
    },
  },
  {
    name: 'Pagefind search input',
    font: 'var(--ocx-font-mono)',
    open: async (page) => {
      await page.goto('/docs/');
      await page.locator('site-search > button').first().click();
      const input = page.locator('#starlight__search .pagefind-ui__search-input');
      await expect(input).toBeVisible();
      return input;
    },
  },
];

test.describe('WP14a control consistency', () => {
  test.skip(({ isMobile }) => isMobile, 'tokens are viewport-independent; chromium covers it');

  for (const c of CONTROLS) {
    test(`WP14a consistency: ${c.name} border-width, border-radius, font-family and block-size equal the tokens`, async ({
      page,
    }) => {
      const el = await c.open(page);
      await expect(el).toBeVisible();
      expect(await computed(el, 'border-top-width'), 'border-width').toBe(
        await resolve(page, 'border-top', 'var(--ocx-border-width) solid', 'border-top-width'),
      );
      expect(await computed(el, 'border-top-left-radius'), 'border-radius').toBe(
        await resolve(page, 'border-top-left-radius', 'var(--ocx-radius-md)'),
      );
      expect(await computed(el, 'font-family'), 'font-family').toBe(await resolve(page, 'font-family', c.font));
      const height = await el.evaluate((node) => node.getBoundingClientRect().height);
      expect(height, 'block-size').toBeCloseTo(await resolveBlockSize(page, H38), 0);
    });
  }
});
