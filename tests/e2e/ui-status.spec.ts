// WP14a status primitives on their story pages (stories/{tag,loader,skeleton}/{default,states}; the
// component pages only embed them):
// axe in both schemes, Loader motion gated on prefers-reduced-motion, Loader hidden without JS,
// Skeleton reserves its box, dark parity.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { computed, resolve } from './tokens.ts';

const PAGE = {
  Tag: '/docs/components/tag/',
  Loader: '/docs/components/loader/',
  Skeleton: '/docs/components/skeleton/',
};
const story = (slug: string, name: 'default' | 'states') => `/docs/stories/${slug}/${name}/`;
const STORIES = Object.fromEntries(
  ['tag', 'loader', 'skeleton'].map((slug) => [slug, [story(slug, 'default'), story(slug, 'states')]]),
) as Record<string, string[]>;
const LOADER = story('loader', 'default');

test.describe('WP14a status primitives', () => {
  test('WP14a status: the showcase renders Tags of both variants, a Loader of each size and a Skeleton', async ({
    page,
  }) => {
    await page.goto(story('tag', 'states'));
    for (const v of ['label', 'stamp'])
      await expect(page.locator(`#story .ocx-ui-tag[data-variant="${v}"]`).first()).toBeVisible();
    await page.goto(story('loader', 'states'));
    for (const s of ['s', 'm'])
      await expect(page.locator(`#story .ocx-ui-loader[data-size="${s}"]`).first()).toBeVisible();
    await page.goto(story('skeleton', 'default'));
    await expect(page.locator('#story .ocx-ui-skeleton').first()).toBeAttached();
  });

  test('WP14a status: every primitive has a section showing its states (tones, loading sizes, skeleton)', async ({
    page,
  }) => {
    const main = page.locator('main');
    for (const [h, path] of Object.entries(PAGE)) {
      await page.goto(path);
      await expect(main.getByRole('heading', { name: h, exact: true })).toBeVisible();
    }
    await page.goto(story('tag', 'states'));
    for (const variant of ['label', 'stamp'])
      for (const tone of ['neutral', 'keyword', 'success', 'warning', 'danger'])
        await expect(
          page.locator(`#story .ocx-ui-tag[data-variant="${variant}"][data-tone="${tone}"]`).first(),
        ).toBeVisible();
  });

  for (const theme of ['light', 'dark'])
    for (const [slug, routes] of Object.entries(STORIES))
      test(`WP14a status: axe reports no violations on the ${slug} stories (${theme})`, async ({ page }) => {
        for (const route of routes) {
          await page.goto(route);
          await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
          // Tag colours fade on theme flip; axe must read the settled colours. CSSTransition only:
          // the Loader's infinite spinner never finishes.
          await page.evaluate(() =>
            Promise.all(
              document
                .getAnimations()
                .filter((a) => a instanceof CSSTransition)
                .map((a) => a.finished.catch(() => undefined)),
            ),
          );
          const { violations } = await new AxeBuilder({ page }).include('#story').analyze();
          expect(
            violations.map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
          ).toEqual([]);
        }
      });

  test('WP14a status: the Loader is a named, visible status region', async ({ page }) => {
    await page.goto(LOADER);
    const loader = page.locator('#story .ocx-ui-loader').first();
    await expect(loader).toHaveAttribute('role', 'status');
    await expect(loader).toBeVisible();
    await expect(loader.locator('.ocx-ui-loader__label')).not.toBeEmpty();
    await expect(loader.locator('.ocx-ui-loader__spinner')).toHaveAttribute('aria-hidden', 'true');
  });

  test('WP14a status: the Loader layers cycle without a motion preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(LOADER);
    const spinner = page.locator('#story .ocx-ui-loader__spinner > i').first();
    expect(await computed(spinner, 'animation-name')).not.toBe('none');
    expect(await computed(spinner, 'animation-iteration-count')).toBe('infinite');
  });

  test('WP14a status: under prefers-reduced-motion the spinner is static and the label still shows', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(LOADER);
    const loader = page.locator('#story .ocx-ui-loader').first();
    for (const layer of await loader.locator('.ocx-ui-loader__spinner > i').all())
      expect(await computed(layer, 'animation-name')).toBe('none');
    await expect(loader.locator('.ocx-ui-loader__label')).toBeVisible();
  });

  test('WP14a status: a hidden Loader ([hidden]) takes no space', async ({ page }) => {
    await page.goto(LOADER);
    const loader = page.locator('#story .ocx-ui-loader').first();
    await loader.evaluate((el) => el.setAttribute('hidden', ''));
    await expect(loader).toBeHidden();
    expect(await computed(loader, 'display')).toBe('none');
  });

  test('WP14a status: the Skeleton reserves lines × line-height and is hidden from assistive tech', async ({
    page,
  }) => {
    await page.goto(story('skeleton', 'default'));
    const sk = page.locator('#story .ocx-ui-skeleton').first();
    await expect(sk).toHaveAttribute('aria-hidden', 'true');
    const [lines, lh, height] = await sk.evaluate((el) => [
      el.querySelectorAll('.ocx-ui-skeleton__line').length,
      parseFloat(getComputedStyle(el).lineHeight),
      el.getBoundingClientRect().height,
    ]);
    expect(lines).toBeGreaterThan(0);
    expect(height).toBeCloseTo(lines * lh, 0);
    expect(await computed(sk.locator('.ocx-ui-skeleton__line').first(), 'animation-name')).toBe('none');
  });

  test('WP14a status: Tag and Loader colours follow the scheme tokens (dark parity)', async ({ page }) => {
    await page.goto(LOADER);
    const layer = page.locator('#story .ocx-ui-loader__spinner > i').first();
    const label = page.locator('#story .ocx-ui-loader__label').first();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      expect(await computed(layer, 'background-color'), theme).toBe(
        await resolve(page, 'background-color', 'var(--ocx-color-border-control)'),
      );
      expect(await layer.evaluate((el) => getComputedStyle(el, '::after').backgroundColor), theme).toBe(
        await resolve(page, 'background-color', 'var(--ocx-color-fg-muted)'),
      );
      expect(await computed(label, 'color'), theme).toBe(await resolve(page, 'color', 'var(--ocx-color-fg-muted)'));
    }
  });
});

test.describe('WP14a status without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('WP14a status: with scripting off the Loader is hidden (a loader without JS never finishes)', async ({
    page,
  }) => {
    await page.goto(LOADER);
    await expect(page.locator('#story .ocx-ui-loader').first()).toBeHidden();
    await page.goto(story('tag', 'states'));
    await expect(page.locator('#story .ocx-ui-tag').first()).toBeVisible();
  });
});
