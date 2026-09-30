// WP13.4 DependencyExplorer on its showcase page, fed the trimmed real
// examples/starlight/public/data/dependencies.json (hostile data is injected
// per test by route interception, never committed).
import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { type Locator, type Page, type Route, expect, test } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { resolve } from './tokens.ts';

type Comp = {
  name: string;
  version: string;
  license: string;
  description: string;
  author: string;
  links: Record<string, string>;
};
type Data = {
  generated: string;
  binaries: Record<
    string,
    { summary: { total: number; uniqueLicenses: number; licenses: Record<string, number> }; components: Comp[] }
  >;
};

const PAGE = '/docs/stories/dependency-explorer/default/';
const EMPTY = '/docs/stories/dependency-explorer/states/';
const DATA_URL = '/docs/data/dependencies.json';
const DATA = JSON.parse(
  readFileSync(new URL('../../examples/starlight/public/data/dependencies.json', import.meta.url), 'utf8'),
) as Data;
const BIN = DATA.binaries['ocx']!;

// The page holds one explorer; its state buttons show the error and empty states.
const root = (page: Page) => page.locator('.ocx-deps').first();
// A filter hides rows (C-220: row machines need their parts in the document); rows = the visible ones.
const rows = (page: Page) => root(page).locator('tbody tr[data-key]:not([hidden])');
const row = (page: Page, key: string) => root(page).locator(`tbody tr[data-key="${key}"]`);
const keys = (page: Page) => rows(page).evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-key')));
const search = (page: Page) => root(page).getByRole('searchbox', { name: 'Search dependencies' });
const license = (page: Page) => root(page).getByRole('combobox', { name: 'License' });
const licenseList = (page: Page) => page.getByRole('listbox', { name: 'License' }).first();
/** Choose a licence through the Zag Select (C-161): open the list, click the option. */
async function pickLicense(page: Page, name: string) {
  await license(page).click();
  await licenseList(page).locator(`[role="option"][data-value="${name}"]`).click();
  await expect(licenseList(page)).toBeHidden();
}
const toggle = (page: Page, key: string) => row(page, key).getByRole('button');
const detailOf = async (page: Page, key: string) => {
  const id = await toggle(page, key).getAttribute('aria-controls');
  if (!id) throw new Error(`${key} toggle has no aria-controls`);
  return page.locator(`[id="${id}"]`);
};

async function ready(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(rows(page)).toHaveCount(BIN.components.length);
}
/** `n` real components as a dependency file (summary consistent with them). */
const sbomOf = (components: Comp[]): Data => ({
  generated: DATA.generated,
  binaries: {
    ocx: {
      summary: {
        total: components.length,
        uniqueLicenses: new Set(components.map((c) => c.license)).size,
        licenses: Object.fromEntries(components.map((c) => [c.license, 1])),
      },
      components,
    },
  },
});
/** The explorer's height and the offset of what follows it: equal before and after load = no shift (C-221). */
const footprint = (el: Locator) =>
  el.evaluate((e) => {
    const box = e.getBoundingClientRect();
    // The next rendered element (a <script> sibling has no box).
    let next: Element | null = e;
    do next = next.nextElementSibling ?? next.parentElement?.nextElementSibling ?? null;
    while (next && next.getClientRects().length === 0);
    return { height: box.height, next: next ? next.getBoundingClientRect().top - box.top : null };
  });

test.describe('WP13.4 DependencyExplorer', () => {
  test('WP13.4 DependencyExplorer: fetches ${BASE_URL}data/dependencies.json on load, not on interaction (7166c012d)', async ({
    page,
  }) => {
    const request = page.waitForRequest((r) => new URL(r.url()).pathname === DATA_URL);
    await page.goto(PAGE);
    await request;
  });

  test('WP13.4 DependencyExplorer: shows a loading status until the data arrives (7166c012d)', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(`**${DATA_URL}`, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(PAGE);
    await expect(root(page).getByRole('status')).toHaveText('Loading dependency data…');
    release();
    await expect(rows(page)).toHaveCount(BIN.components.length);
    await expect(root(page).locator('.ocx-deps__loading')).toBeHidden();
  });

  test('WP13.4 DependencyExplorer: three summary stats — dependencies, licenses, generated (7166c012d)', async ({
    page,
  }) => {
    await ready(page);
    const stats = root(page).locator('.ocx-deps__stat');
    await expect(stats).toHaveCount(3);
    await expect(stats.locator('.ocx-deps__stat-label')).toHaveText(['Dependencies', 'Licenses', 'Generated']);
    await expect(stats.locator('.ocx-deps__stat-value')).toHaveText([
      String(BIN.summary.total),
      String(BIN.summary.uniqueLicenses),
      DATA.generated,
    ]);
    await expect(root(page).locator('.ocx-deps__count')).toHaveText(
      `Showing ${BIN.components.length} of ${BIN.summary.total} components`,
    );
  });

  test('WP13.4 C-161 DependencyExplorer: licence options are "All licenses" then each licence with its count, most-used first (7166c012d)', async ({
    page,
  }) => {
    await ready(page);
    const want = Object.entries(BIN.summary.licenses).sort((a, b) => b[1] - a[1]);
    await license(page).click();
    const options = licenseList(page).getByRole('option');
    await expect(options.locator('.ocx-ui-option__label')).toHaveText(['All licenses', ...want.map(([l]) => l)]);
    await expect(options.locator('.ocx-ui-option__meta')).toHaveText(want.map(([, n]) => String(n)));
  });

  test('WP13.4 DependencyExplorer: search is a case-insensitive substring over name and description (7166c012d)', async ({
    page,
  }) => {
    await ready(page);
    await search(page).fill('PURE RUST');
    expect(await keys(page)).toEqual(['aes@0.8.4', 'base16ct@0.2.0', 'base64ct@1.8.3', 'ed25519-dalek@2.2.0']);
    await search(page).fill('darling');
    expect(await keys(page)).toEqual(['darling@0.20.11', 'darling@0.23.0', 'darling_core@0.20.11']);
    await expect(root(page).locator('.ocx-deps__count')).toHaveText(`Showing 3 of ${BIN.summary.total} components`);
  });

  test('WP13.4 DependencyExplorer: licence filter is exact and AND-ed with the search (7166c012d)', async ({
    page,
  }) => {
    await ready(page);
    await pickLicense(page, 'MIT');
    await expect(rows(page)).toHaveCount(BIN.components.filter((c) => c.license === 'MIT').length);
    await expect(rows(page).filter({ hasText: 'MIT OR Apache-2.0' })).toHaveCount(0);
    await pickLicense(page, 'Apache-2.0 OR MIT');
    await search(page).fill('pure rust');
    expect(await keys(page)).toEqual(['base16ct@0.2.0', 'base64ct@1.8.3']);
  });

  test('WP13.4 DependencyExplorer: no match shows the empty state and zero rows (7166c012d)', async ({ page }) => {
    await ready(page);
    await expect(root(page).locator('.ocx-deps__empty')).toBeHidden();
    await search(page).fill('no-such-crate');
    await expect(rows(page)).toHaveCount(0);
    await expect(root(page).locator('.ocx-deps__empty')).toHaveText('No dependencies match the current filters.');
    await expect(root(page).locator('.ocx-deps__count')).toHaveText(`Showing 0 of ${BIN.summary.total} components`);
    await search(page).fill('');
    await expect(root(page).locator('.ocx-deps__empty')).toBeHidden();
  });

  test('C-274 DependencyExplorer: the search is a SearchField; its clear button and Escape restore every row', async ({
    page,
  }) => {
    await ready(page);
    const clear = root(page).locator('.ocx-deps__search .ocx-ui-search-field__clear');
    await expect(clear).toBeHidden();
    await search(page).fill('darling');
    await expect(rows(page)).toHaveCount(3);
    await expect(clear).toBeVisible();
    await expect(clear).toHaveAccessibleName('Clear Search dependencies');
    await clear.click();
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(BIN.components.length);
    await expect(root(page).locator('.ocx-deps__count')).toHaveText(
      `Showing ${BIN.components.length} of ${BIN.summary.total} components`,
    );
    await search(page).fill('no-such-crate');
    await expect(root(page).locator('.ocx-deps__empty')).toBeVisible();
    await search(page).press('Escape');
    await expect(root(page).locator('.ocx-deps__empty')).toBeHidden();
    await expect(rows(page)).toHaveCount(BIN.components.length);
  });

  test('WP13.4 DependencyExplorer: expanding is keyed name@version — base64@0.21.7 opens, base64@0.22.1 stays shut (7166c012d)', async ({
    page,
  }) => {
    await ready(page);
    const old = toggle(page, 'base64@0.21.7');
    await expect(old).toHaveAttribute('aria-expanded', 'false');
    await old.click();
    await expect(old).toHaveAttribute('aria-expanded', 'true');
    const detail = await detailOf(page, 'base64@0.21.7');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('encodes and decodes base64 as bytes or utf8');
    await expect(detail).toContainText('By Alice Maz');
    await expect(toggle(page, 'base64@0.22.1')).toHaveAttribute('aria-expanded', 'false');
    await old.click();
    await expect(old).toHaveAttribute('aria-expanded', 'false');
    await expect(detail).toBeHidden();
  });

  test('WP13.4 DependencyExplorer: an expanded row stays expanded across filtering (7166c012d)', async ({ page }) => {
    await ready(page);
    await toggle(page, 'aes@0.8.4').click();
    await search(page).fill('darling');
    await expect(row(page, 'aes@0.8.4')).toBeHidden();
    await search(page).fill('');
    await expect(toggle(page, 'aes@0.8.4')).toHaveAttribute('aria-expanded', 'true');
    await expect(await detailOf(page, 'aes@0.8.4')).toBeVisible();
  });

  test('WP13.4 DependencyExplorer: the row toggle is a keyboard-operable button (WP13.4)', async ({ page }) => {
    await ready(page);
    const t = toggle(page, 'bytes@1.12.1');
    await t.focus();
    await page.keyboard.press('Enter');
    await expect(t).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(t).toHaveAttribute('aria-expanded', 'false');
  });

  test('WP13.4 DependencyExplorer: clicking anywhere on the row toggles it; clicking a link inside does not (7166c012d)', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'the links column is hidden on mobile');
    await ready(page);
    const aes = row(page, 'aes@0.8.4');
    await aes.locator('td').nth(1).click();
    await expect(toggle(page, 'aes@0.8.4')).toHaveAttribute('aria-expanded', 'true');
    await context.route('https://crates.io/**', (route) => route.abort());
    await aes.getByRole('link', { name: 'crates.io' }).click();
    await expect(toggle(page, 'aes@0.8.4')).toHaveAttribute('aria-expanded', 'true');
    await aes.locator('td').nth(2).click();
    await expect(toggle(page, 'aes@0.8.4')).toHaveAttribute('aria-expanded', 'false');
  });

  test('WP13.4 DependencyExplorer: the loading state reserves room — the data lands without shifting anything (CLS 0)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] };
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      // Only shifts of the explorer or what follows it: the theme's web-font swap
      // (header, sidebars, before the explorer in DOM order) is not this component's.
      const ours = (n: Node | null) => {
        const root = document.querySelector('.ocx-deps');
        return (
          !!n && !!root && (root.contains(n) || !!(root.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING))
        );
      };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Shift[])
          if (!e.hadRecentInput && e.sources.some((s) => ours(s.node))) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    // Hold the data back so the loading state is painted first.
    await page.route(`**${DATA_URL}`, async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await ready(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  });

  test('WP13.4 DependencyExplorer: a row with no description or author has no toggle; no links → no anchors (7166c012d)', async ({
    page,
  }) => {
    await ready(page);
    const bare = row(page, 'ocx_config@0.6.3');
    await expect(bare).toContainText('ocx_config');
    await expect(bare.getByRole('button')).toHaveCount(0);
    await expect(bare.locator('a')).toHaveCount(0);
  });

  test('WP13.4 DependencyExplorer: links render per present key, open in a new tab with rel=noopener (7166c012d)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'links column is hidden on mobile; see the mobile test');
    await ready(page);
    const aes = row(page, 'aes@0.8.4');
    await expect(aes.getByRole('link')).toHaveText(['crates.io', 'docs', 'repo']);
    await expect(aes.getByRole('link', { name: 'crates.io' })).toHaveAttribute('href', 'https://crates.io/crates/aes');
    for (const a of await aes.getByRole('link').all()) {
      await expect(a).toHaveAttribute('target', '_blank');
      await expect(a).toHaveAttribute('rel', /\bnoopener\b/);
    }
    // oci-client has docsRs + repository but no cratesIo.
    await expect(row(page, 'oci-client@0.17.0').getByRole('link')).toHaveText(['docs', 'repo']);
  });

  test('WP13.4 DependencyExplorer: desktop shows License and Links columns; the inline copy in the detail is hidden (7166c012d)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'desktop layout');
    await ready(page);
    await expect(root(page).getByRole('columnheader', { name: 'License' })).toBeVisible();
    await expect(root(page).getByRole('columnheader', { name: 'Links' })).toBeVisible();
    await toggle(page, 'aes@0.8.4').click();
    await expect((await detailOf(page, 'aes@0.8.4')).getByText('License: MIT OR Apache-2.0')).toBeHidden();
  });

  test('WP13.4 DependencyExplorer: mobile hides License/Links columns and shows them inline in the expanded row (7166c012d)', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile layout');
    await ready(page);
    await expect(root(page).getByRole('columnheader', { name: 'License' })).toBeHidden();
    await expect(root(page).getByRole('columnheader', { name: 'Links' })).toBeHidden();
    await toggle(page, 'aes@0.8.4').click();
    const detail = await detailOf(page, 'aes@0.8.4');
    await expect(detail.getByText('License: MIT OR Apache-2.0')).toBeVisible();
    await expect(detail.getByRole('link', { name: 'crates.io' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('WP13.4 DependencyExplorer: an aborted fetch shows the error banner, not the table (7166c012d)', async ({
    page,
  }) => {
    await page.route(`**${DATA_URL}`, (route) => route.abort());
    await page.goto(PAGE);
    await expect(root(page).getByRole('alert')).toContainText('Failed to load dependencies');
    await expect(root(page).locator('.ocx-deps__loading').first()).toBeHidden();
    await expect(root(page).locator('table')).toBeHidden();
  });

  test('WP13.4 DependencyExplorer: an HTTP error names the status in the banner (7166c012d)', async ({ page }) => {
    await page.route(`**${DATA_URL}`, (route) => route.fulfill({ status: 500, body: 'boom' }));
    await page.goto(PAGE);
    await expect(root(page).getByRole('alert')).toContainText('HTTP 500');
  });

  test('WP13.4 DependencyExplorer: valid-but-misshapen JSON (a binary missing summary/components) shows the error banner, not a stuck spinner (WP13.4)', async ({
    page,
  }) => {
    await page.route(`**${DATA_URL}`, (route: Route) => route.fulfill({ json: { binaries: { x: {} } } }));
    await page.goto(PAGE);
    await expect(root(page).getByRole('alert')).toContainText('Failed to load dependencies');
    await expect(root(page).locator('.ocx-deps__loading').first()).toBeHidden();
    await expect(root(page).locator('table')).toBeHidden();
  });

  test('WP13.4 DependencyExplorer: hostile data renders as text — no HTML injection, no javascript:/data: links (WP13.4)', async ({
    page,
  }, testInfo) => {
    const NAME = '<img src=x onerror="window.__ocxPwned=1">';
    const hostile: Comp = {
      name: NAME,
      version: '6.6.6',
      license: 'MIT',
      description: '<script>window.__ocxPwned=2</script><b>bold</b>',
      author: '<svg onload="window.__ocxPwned=3">',
      links: {
        cratesIo: 'javascript:window.__ocxPwned=4',
        docsRs: 'data:text/html,<script>1</script>',
        repository: 'https://example.com/r',
      },
    };
    const data = structuredClone(DATA);
    data.binaries['ocx']!.components.unshift({ ...hostile, scope: 'required' } as Comp);
    await page.route(`**${DATA_URL}`, (route: Route) => route.fulfill({ json: data }));
    await page.goto(PAGE);
    const key = `${NAME}@6.6.6`;
    const tr = rows(page).first();
    await expect(tr).toHaveAttribute('data-key', key);
    await expect(tr).toContainText(NAME);
    await tr.getByRole('button').click();
    await expect(root(page)).toContainText('<script>window.__ocxPwned=2</script><b>bold</b>');
    await expect(root(page)).toContainText('By <svg onload="window.__ocxPwned=3">');
    await expect(root(page).locator('tbody img, tbody script, tbody b, tbody svg[onload]')).toHaveCount(0);
    await expect(root(page).locator('a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0);
    if (testInfo.project.name !== 'mobile') {
      await expect(tr.getByRole('link')).toHaveText(['repo']);
    }
    expect(await page.evaluate(() => (window as unknown as { __ocxPwned?: number }).__ocxPwned)).toBeUndefined();
  });

  for (const theme of ['light', 'dark']) {
    test(`WP13.4 DependencyExplorer: axe reports no violations with data loaded and a row expanded (${theme})`, async ({
      page,
    }) => {
      await ready(page);
      await toggle(page, 'aes@0.8.4').click();
      await page.evaluate((t) => (document.documentElement.dataset['theme'] = t), theme);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('C-161 DependencyExplorer: the licence list looks like the showcase Select (surface and option rows)', async ({
    page,
  }) => {
    const look = async (trigger: Locator) => {
      await trigger.click();
      const list = page.getByRole('listbox').first();
      await expect(list).toBeVisible();
      const out = await list.evaluate((l) => {
        const css = (e: Element) => getComputedStyle(e);
        const opt = l.querySelectorAll('[role="option"]')[1]!;
        const meta = opt.querySelector('.ocx-ui-option__meta');
        const p = css(l);
        const o = css(opt);
        return {
          list: [p.backgroundColor, p.borderTopWidth, p.borderTopColor, p.borderTopLeftRadius, p.boxShadow],
          option: [o.display, o.fontFamily, o.fontSize, o.paddingTop, o.paddingLeft, o.borderTopLeftRadius],
          meta: meta ? [css(meta).fontSize, css(meta).color] : null,
        };
      });
      await page.keyboard.press('Escape');
      await expect(list).toBeHidden();
      return out;
    };
    await page.goto('/docs/stories/select/states/');
    // The states demo whose options carry a meta (the licences demo).
    const want = await look(page.getByRole('combobox', { name: 'License', exact: true }));
    await ready(page);
    expect(await look(license(page))).toEqual(want);
  });

  test('C-161 DependencyExplorer: the licence filter works from the keyboard alone', async ({ page }) => {
    await ready(page);
    const first = Object.entries(BIN.summary.licenses).sort((a, b) => b[1] - a[1])[0]!;
    const trigger = license(page);
    await trigger.focus();
    await expect(root(page).locator('[data-zag-root="select"]')).toHaveAttribute('data-zag-state', 'live');
    await page.keyboard.press('Enter');
    await expect(licenseList(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveText(first[0]);
    await expect(rows(page)).toHaveCount(first[1]);
    await expect(trigger).toBeFocused();
  });

  test('WP14c DependencyExplorer: the Loader (count line) and a Skeleton reserve (placeholder rows) show while loading; the table head and controls do not move when data lands', async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(`**${DATA_URL}`, async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(PAGE);
    const loading = root(page).locator('.ocx-deps__loading');
    await expect(root(page).locator('.ocx-deps__count .ocx-ui-loader')).toBeVisible();
    await expect(loading.first().locator('.ocx-ui-skeleton').first()).toBeVisible();
    await expect(root(page).locator('table')).toHaveAttribute('aria-busy', 'true');
    const head = root(page).locator('thead');
    const controls = root(page).locator('.ocx-deps__controls');
    await expect(head).toBeVisible();
    const before = [await head.boundingBox(), await controls.boundingBox()];
    release();
    await expect(rows(page)).toHaveCount(BIN.components.length);
    await expect(loading).toBeHidden();
    await expect(root(page).locator('table')).not.toHaveAttribute('aria-busy', 'true');
    expect([await head.boundingBox(), await controls.boundingBox()]).toEqual(before);
  });

  test('WP14c DependencyExplorer: a load failure is a Starlight danger aside', async ({ page }) => {
    await page.route(`**${DATA_URL}`, (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(PAGE);
    const error = root(page).locator('.starlight-aside.starlight-aside--danger');
    await expect(error).toBeVisible();
    await expect(error).toContainText('HTTP 404');
    expect(await error.evaluate((e) => getComputedStyle(e).borderInlineStartColor)).toBe(
      await resolve(page, 'color', 'var(--ocx-color-danger)'),
    );
  });

  test('WP14c DependencyExplorer showcase: error and empty demos render their states', async ({ page }) => {
    // The demo's own buttons (C-222) show the error and empty states; a known empty list is the states story.
    await ready(page);
    await expect(page.locator('.ocx-deps')).toHaveCount(1);
    await page.getByRole('button', { name: 'Bad data' }).click();
    await expect(root(page).getByRole('alert')).toContainText('no binary in the data');
    await expect(root(page).locator('table')).toBeHidden();
    await page.getByRole('button', { name: 'No rows' }).click();
    await expect(root(page).locator('.ocx-deps__empty')).toBeVisible();
    await expect(root(page).locator('.ocx-deps__count')).toHaveText('Showing 0 of 0 components');
  });

  test('WP14c a known empty list renders its empty state from first paint', async ({ page }) => {
    await page.goto(EMPTY);
    await expect(page.locator('.ocx-deps')).toHaveCount(1);
    await expect(page.locator('.ocx-deps .ocx-deps__empty')).toBeVisible();
  });
});

test.describe('Z11 DependencyExplorer on Zag', () => {
  test('C-220 an expandable row is a Zag collapsible: idle until touched, live after, its trigger opens the detail', async ({
    page,
  }) => {
    await ready(page);
    await page.evaluate(() => {
      const w = window as unknown as { __changes: unknown[] };
      w.__changes = [];
      document.addEventListener('ocx:collapsible:change', (e) => w.__changes.push((e as CustomEvent).detail));
    });
    const tr = row(page, 'aes@0.8.4');
    await expect(tr).toHaveAttribute('data-zag-root', 'collapsible');
    await expect(tr).toHaveAttribute('data-zag-state', 'idle');
    await expect(row(page, 'ocx_config@0.6.3')).not.toHaveAttribute('data-zag-root');
    await tr.hover();
    await expect(tr).toHaveAttribute('data-zag-state', 'live');
    await toggle(page, 'aes@0.8.4').click();
    await expect(toggle(page, 'aes@0.8.4')).toHaveAttribute('data-state', 'open');
    const detail = await detailOf(page, 'aes@0.8.4');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Pure Rust implementation');
    expect(await page.evaluate(() => (window as unknown as { __changes: unknown[] }).__changes)).toEqual([
      { open: true },
    ]);
  });

  test('C-220 a detail row stays empty until its row first opens (DOM budget)', async ({ page }) => {
    await ready(page);
    const details = root(page).locator('tbody tr.ocx-deps__detail');
    await expect(details).toHaveCount(BIN.components.filter((c) => c.description || c.author).length);
    expect(await details.locator('td > *').count()).toBe(0);
  });

  test('C-220 a click that lands before the row machine loads opens the row once (replay)', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\/collapsible\.zag\.[^/]*\.js$/, async (route) => {
      await gate;
      await route.continue();
    });
    await ready(page);
    const t = toggle(page, 'bytes@1.12.1');
    await t.click();
    await expect(row(page, 'bytes@1.12.1')).toHaveAttribute('data-zag-state', 'loading');
    release();
    await expect(row(page, 'bytes@1.12.1')).toHaveAttribute('data-zag-state', 'live');
    await expect(t).toHaveAttribute('aria-expanded', 'true');
  });

  test('C-220 row open/close and a reload leak nothing (C-114)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'CDP counters: the desktop (chromium) project');
    await ready(page);
    // The EventLog grows by design; leak cycles measure the explorer, so it goes first.
    await page.evaluate(() => document.querySelectorAll('.showcase-log').forEach((l) => l.remove()));
    const t = toggle(page, 'aes@0.8.4');
    await expectNoLeak(page, async () => {
      await t.click();
      await expect(t).toHaveAttribute('aria-expanded', 'true');
      await t.click();
      await expect(t).toHaveAttribute('aria-expanded', 'false');
    });
    // A reload tears down every row machine it replaces.
    await expectNoLeak(
      page,
      async () => {
        await page.evaluate(() => document.querySelector('.ocx-deps')?.dispatchEvent(new CustomEvent('ocx:deps:load')));
        await expect(root(page).locator('table')).not.toHaveAttribute('aria-busy');
        await row(page, 'aes@0.8.4').hover();
        await expect(row(page, 'aes@0.8.4')).toHaveAttribute('data-zag-state', 'live');
      },
      { n: 8 },
    );
  });

  test('C-221 an SBOM with no rows reserves its empty state: nothing moves when it loads', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Hold the explorer's script so the server-rendered loading state can be measured.
    await page.route('**/DependencyExplorer.astro_astro_type_script*', async (route) => {
      await gate;
      await route.continue();
    });
    // Module scripts hold DOMContentLoaded, so wait for the markup, not a load event.
    // The known empty list is the states story (its only explorer).
    await page.goto(EMPTY, { waitUntil: 'commit' });
    const demo = page.locator('.ocx-deps').first();
    await demo.waitFor({ state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    await expect(demo.locator('table')).toHaveAttribute('aria-busy', 'true');
    const before = await footprint(demo);
    release();
    await expect(demo.locator('.ocx-deps__count')).toHaveText('Showing 0 of 0 components');
    await expect(demo.locator('.ocx-deps__empty')).toBeVisible();
    expect(await footprint(demo)).toEqual(before);
  });

  test('C-221 an SBOM of exactly the cap (12 rows) fills its placeholders: nothing moves when it loads', async ({
    page,
  }) => {
    const twelve = sbomOf(BIN.components.slice(0, 12));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(`**${DATA_URL}`, async (route) => {
      await gate;
      await route.fulfill({ json: twelve });
    });
    await page.goto(PAGE);
    await page.evaluate(() => document.fonts.ready);
    await expect(root(page).locator('tbody tr.ocx-deps__loading')).toHaveCount(12);
    const before = await footprint(root(page));
    release();
    await expect(rows(page)).toHaveCount(12);
    expect(await footprint(root(page))).toEqual(before);
  });

  test('C-222 the showcase reload button shows the loading state again, then the rows', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Reload, 2 s slower' }).click();
    await expect(root(page).locator('table')).toHaveAttribute('aria-busy', 'true');
    await expect(root(page).getByRole('status')).toHaveText('Loading dependency data…');
    await expect(root(page).locator('tbody tr.ocx-deps__loading')).toHaveCount(12);
    await expect(rows(page)).toHaveCount(0);
    await expect(root(page).locator('.ocx-deps__stat-value .ocx-ui-skeleton')).toHaveCount(3);
    await expect(rows(page)).toHaveCount(BIN.components.length, { timeout: 10_000 });
    await expect(root(page).locator('table')).not.toHaveAttribute('aria-busy');
  });

  test('C-222 ocx:deps:load renders the given data (or a promise of it) in place; filters still apply once', async ({
    page,
  }) => {
    await ready(page);
    const three = sbomOf(BIN.components.filter((c) => ['aes', 'bytes', 'ocx_config'].includes(c.name)));
    await page.evaluate(
      (data) =>
        document
          .querySelector('.ocx-deps')
          ?.dispatchEvent(new CustomEvent('ocx:deps:load', { detail: { data: Promise.resolve(data) } })),
      three,
    );
    await expect(rows(page)).toHaveCount(3);
    await expect(root(page).locator('.ocx-deps__stat-value').first()).toHaveText('3');
    await search(page).fill('bytes');
    expect(await keys(page)).toEqual(['bytes@1.12.1']);
    await expect(root(page).locator('.ocx-deps__count')).toHaveText('Showing 1 of 3 components');
  });

  test('C-222 typing while a reload is in flight keeps the Loader; the filter applies once the rows land', async ({
    page,
  }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Reload, 2 s slower' }).click();
    await expect(root(page).locator('table')).toHaveAttribute('aria-busy', 'true');
    await search(page).fill('darling');
    await expect(root(page).getByRole('status')).toHaveText('Loading dependency data…');
    await expect(rows(page)).toHaveCount(0);
    await expect(root(page).locator('table')).not.toHaveAttribute('aria-busy', { timeout: 10_000 });
    expect(await keys(page)).toEqual(['darling@0.20.11', 'darling@0.23.0', 'darling_core@0.20.11']);
  });

  test('C-130f the row chevron follows the Zag open state', async ({ page }) => {
    await ready(page);
    const svg = toggle(page, 'aes@0.8.4').locator('svg');
    const angle = () => svg.evaluate((e) => getComputedStyle(e).transform);
    const closed = await angle();
    await toggle(page, 'aes@0.8.4').click();
    await expect(toggle(page, 'aes@0.8.4')).toHaveAttribute('data-state', 'open');
    await expect.poll(angle).not.toBe(closed);
  });
});
