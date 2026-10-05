// WP13.3 Tree / Node / Description: interaction on the tree stories (/docs/stories/tree/<name>/).
// Markup contract: see packages/theme/test/components-tree.test.ts. Story trees:
//   DEFAULT ~/.ocx/ layout (selectable) · OPEN ~/.ocx/packages/ (open-icon, not selectable) ·
//   INLINE index (long names, <code>) and toolchain · PER_NODE selectable per node (directories
//   opt out) · NO_COLLAPSE collapsible={false} with default icons. Each story holds its trees from 0.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const DEFAULT = '/docs/stories/tree/default/';
const OPEN = '/docs/stories/tree/open-icons-not-selectable/';
const INLINE = '/docs/stories/tree/inline-code-and-long-names/';
const PER_NODE = '/docs/stories/tree/selectable-per-node/';
const NO_COLLAPSE = '/docs/stories/tree/not-collapsible/';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tree = (page: Page, n: number) => page.locator('.ocx-tree').nth(n);
/** A second, non-selectable tree beside the first, as markup only: a row to press outside the first tree. */
const outsider = async (page: Page) => {
  await page.evaluate(() => {
    const first = document.querySelector('.ocx-tree')!;
    const other = first.cloneNode(true) as HTMLElement;
    other.dataset['outsider'] = '';
    // A clone of a selectable tree would select its own row (and copy the current selection).
    other.dataset['selectable'] = 'false';
    for (const el of other.querySelectorAll('[data-selected]')) el.removeAttribute('data-selected');
    first.after(other);
  });
  return page.locator('[data-outsider] .ocx-tree__row').first();
};
/** The row whose own name is exactly `name` (a directory's summary holds only its own name). */
const row = (t: Locator, name: string) =>
  t
    .locator('.ocx-tree__row')
    .filter({ has: t.page().locator('.ocx-tree__name', { hasText: new RegExp(`^${escape(name)}$`) }) });
/** The icon the reader actually sees (innerText skips the display:none swap partner). */
const shownIcon = (r: Locator) => r.locator('.ocx-tree__icon').evaluate((el) => (el as HTMLElement).innerText.trim());
const cursor = (r: Locator) => r.evaluate((el) => getComputedStyle(el).cursor);
const bg = (r: Locator) => r.evaluate((el) => getComputedStyle(el).backgroundColor);
const chevronTurn = (r: Locator) => r.locator('.ocx-tree__chevron').evaluate((el) => getComputedStyle(el).rotate);

test('WP13.3 Tree: Enter and Space on a directory summary toggle it (keyboard, new over mouse-only Vue)', async ({
  page,
}) => {
  await page.goto(OPEN);
  const t = tree(page, 0);
  const dir = row(t, '{registry}/');
  const child = row(t, 'sha256/ab/c123…/');
  await expect(child).toBeVisible();
  await dir.focus();
  await expect(dir).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(child).toBeHidden();
  await page.keyboard.press('Space');
  await expect(child).toBeVisible();
});

test('WP13.3 Tree: clicking a directory toggles it and swaps icon ↔ open-icon (storage.md open-icon)', async ({
  page,
}) => {
  await page.goto(OPEN);
  const t = tree(page, 0);
  const dir = row(t, '{registry}/');
  const child = row(t, 'sha256/ab/c123…/');
  expect(await shownIcon(dir)).toBe('📂');
  await dir.click();
  await expect(child).toBeHidden();
  await expect.poll(() => shownIcon(dir)).toBe('📁');
  await dir.click();
  await expect(child).toBeVisible();
  await expect.poll(() => shownIcon(dir)).toBe('📂');
});

test('WP13.3 Tree: no native disclosure triangle — the icon replaces ▾/▸ (dbcc8d595)', async ({ page }) => {
  await page.goto(OPEN);
  const summary = row(tree(page, 0), '{registry}/');
  expect(await summary.evaluate((el) => el.tagName)).toBe('SUMMARY');
  const { display, listStyleType } = await summary.evaluate((el) => getComputedStyle(el));
  expect(display === 'list-item' && listStyleType !== 'none').toBe(false);
});

test('WP13.3 Tree: one selected row per tree; clicking it again deselects (FileTree.vue ft-select, dbcc8d595)', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const selected = t.locator('.ocx-tree__row[data-selected]');
  await row(t, 'packages/').click();
  await expect(selected).toHaveCount(1);
  await expect(row(t, 'packages/')).toHaveAttribute('data-selected');
  await row(t, 'layers/').click();
  await expect(selected).toHaveCount(1);
  await expect(row(t, 'layers/')).toHaveAttribute('data-selected');
  await row(t, 'layers/').click();
  await expect(selected).toHaveCount(0);
});

test('WP13.3 Tree: selecting in one tree clears another tree’s selection (pointerdown outside)', async ({ page }) => {
  await page.goto(DEFAULT);
  const first = row(tree(page, 0), 'packages/');
  await first.click();
  await expect(first).toHaveAttribute('data-selected');
  await (await outsider(page)).click();
  await expect(page.locator('.ocx-tree__row[data-selected]')).toHaveCount(0);
});

test('WP13.3 Tree: in a selectable tree a directory click selects and toggles (FileTreeNode.vue handleClick)', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const dir = row(t, 'state/');
  await dir.click();
  await expect(dir).toHaveAttribute('data-selected');
  await expect(row(t, 'projects/')).toBeHidden();
});

test('WP13.3 Tree: selection is opt-in — a default tree toggles on click but selects nothing', async ({ page }) => {
  await page.goto(OPEN);
  const t = tree(page, 0);
  await row(t, 'metadata.json').click();
  await row(t, '{registry}/').click();
  await expect(row(t, 'sha256/ab/c123…/')).toBeHidden();
  await expect(t.locator('[data-selected]')).toHaveCount(0);
});

test('WP13.3 Tree: a Node with selectable={false} only toggles; its selectable siblings select', async ({ page }) => {
  await page.goto(PER_NODE);
  const t = tree(page, 0);
  await row(t, 'ocx.toml').click();
  await row(t, 'src/').click();
  await expect(row(t, 'ocx.toml')).toHaveAttribute('data-selected');
  await expect(row(t, 'src/')).not.toHaveAttribute('data-selected');
  await expect(row(t, 'main.rs')).toBeHidden();
});

test('WP13.3 Tree: a pointerdown outside the tree clears the selection (owner finding 2026-09-28)', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const r = row(t, 'packages/');
  await r.click();
  await expect(r).toHaveAttribute('data-selected');
  await expect(r).toHaveAttribute('aria-current', 'true');
  await page.locator('#story').click({ position: { x: 2, y: 2 } }); // the stage padding, outside the tree
  await expect(t.locator('[data-selected]')).toHaveCount(0);
});

test('WP13.3 Tree: a keyboard selection clears on a click outside, a click inside keeps it', async ({ page }) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const r = row(t, 'layers/');
  await r.focus();
  await page.keyboard.press('Enter');
  await expect(r).toHaveAttribute('data-selected');
  await t.click({ position: { x: 2, y: 2 } }); // the tree's padding: inside, not a row
  await expect(r).toHaveAttribute('data-selected');
  await (await outsider(page)).click(); // another tree is outside this one
  await expect(t.locator('[data-selected]')).toHaveCount(0);
});

test('WP13.3 Tree: Escape on a row clears the selection (APG)', async ({ page }) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const r = row(t, 'packages/');
  await r.click();
  await r.focus();
  await page.keyboard.press('Escape');
  await expect(t.locator('[data-selected]')).toHaveCount(0);
});

test('WP13.3 Tree: a selectable file row takes focus and selects on Enter and Space', async ({ page }) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const r = row(t, 'layers/');
  await r.focus();
  await expect(r).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(r).toHaveAttribute('data-selected');
  await page.keyboard.press(' ');
  await expect(r).not.toHaveAttribute('data-selected');
});

test('WP13.3 Tree: the selected row is highlighted (ft-row--selected)', async ({ page }) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  await row(t, 'packages/').click();
  await page.mouse.move(0, 0); // drop :hover so only the selection paints
  expect(await bg(row(t, 'packages/'))).not.toBe(await bg(row(t, 'layers/')));
});

test('WP13.3 Tree: file rows of a non-selectable tree get no pointer, directory rows do (1b55b24ff)', async ({
  page,
}) => {
  await page.goto(OPEN);
  const t = tree(page, 0);
  expect(await cursor(row(t, 'metadata.json'))).not.toBe('pointer');
  expect(await cursor(row(t, '{registry}/'))).toBe('pointer');
  await page.goto(DEFAULT);
  expect(await cursor(row(tree(page, 0), 'packages/'))).toBe('pointer'); // selectable file row
});

test('WP13.3 Tree: collapsible={false} directory rows get no pointer cursor (1b55b24ff ft-row--dir needs collapsible)', async ({
  page,
}) => {
  await page.goto(NO_COLLAPSE);
  const t = tree(page, 0);
  expect(await shownIcon(row(t, 'build/'))).toBe('📂'); // guard: a rendered directory row, not a bare stub
  expect(await cursor(row(t, 'build/'))).not.toBe('pointer');
});

test('WP13.3 Tree: collapsible={false} ignores clicks and keys — children stay visible, open icon shown (FileTreeNode.vue)', async ({
  page,
}) => {
  await page.goto(NO_COLLAPSE);
  const t = tree(page, 0);
  const dir = row(t, 'build/');
  const child = row(t, 'bin/');
  expect(await shownIcon(dir)).toBe('📂');
  await dir.click();
  await expect(child).toBeVisible();
  await dir.focus();
  await page.keyboard.press('Enter');
  await expect(child).toBeVisible();
  expect(await shownIcon(dir)).toBe('📂');
});

test('WP13.3 Tree: ~/.ocx/ icon="🏠" stays 🏠; the chevron turns instead (owner finding 2026-09-28)', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  const dir = row(tree(page, 0), '~/.ocx/');
  expect(await shownIcon(dir)).toBe('🏠');
  const open = await chevronTurn(dir);
  await dir.click();
  await expect.poll(() => chevronTurn(dir)).not.toBe(open);
  expect(await shownIcon(dir)).toBe('🏠');
});

test('WP13.3 Tree: directory names are neutral fg semibold, file names are not bold (accent is reserved for selection)', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const style = (name: string) =>
    row(t, name)
      .locator('.ocx-tree__name')
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, weight: cs.fontWeight };
      });
  const fg = await t.evaluate((el) => getComputedStyle(el).color);
  const dir = await style('~/.ocx/');
  const file = await style('packages/');
  expect(dir.color).toBe(fg);
  expect(Number(dir.weight)).toBeGreaterThanOrEqual(600); // semibold
  expect(Number(file.weight)).toBeLessThan(600);
});

test('WP13.3 Tree: collapsible={false} shows no chevron and, not selectable, selects nothing', async ({ page }) => {
  await page.goto(NO_COLLAPSE);
  const t = tree(page, 0);
  await expect(t.locator('.ocx-tree__chevron').first()).toBeHidden();
  await row(t, 'build/').click();
  await row(t, 'mytool').click();
  await expect(t.locator('.ocx-tree__row[data-selected]')).toHaveCount(0);
});

test('WP13.3 Tree: each depth indents its rows (guide lines per depth)', async ({ page }) => {
  await page.goto(DEFAULT);
  const t = tree(page, 0);
  const x = async (name: string) => (await row(t, name).boundingBox())!.x;
  const [root, mid, leaf] = [await x('~/.ocx/'), await x('state/'), await x('projects/')];
  expect(mid).toBeGreaterThan(root);
  expect(leaf).toBeGreaterThan(mid);
});

test('WP13.3 Tree: the description is muted against the name (ft-desc)', async ({ page }) => {
  await page.goto(DEFAULT);
  const r = row(tree(page, 0), 'packages/');
  const color = (l: Locator) => l.evaluate((el) => getComputedStyle(el).color);
  expect(await color(r.locator('.ocx-tree__desc'))).not.toBe(await color(r.locator('.ocx-tree__name')));
});

test('WP13.3 Tree: long names and descriptions stay inside the tree, no page scroll (mobile layout)', async ({
  page,
}) => {
  await page.goto(INLINE);
  const t = tree(page, 0);
  const r = row(t, 'p/{ns}/{pkg}/o/sha256/{hex}.json');
  const box = (await t.boundingBox())!;
  for (const part of [r.locator('.ocx-tree__name'), r.locator('.ocx-tree__desc')]) {
    const b = (await part.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});

/** Summed transition + animation seconds on a directory's expand/collapse surfaces. */
const motion = (page: Page) =>
  row(tree(page, 0), '{registry}/').evaluate((summary) => {
    const details = summary.parentElement!;
    const ul = details.querySelector(':scope > .ocx-tree__children');
    const secs = (v: string) =>
      v.split(',').reduce((s, d) => s + (d.trim().endsWith('ms') ? parseFloat(d) / 1000 : parseFloat(d)), 0);
    const styles = [
      getComputedStyle(details, '::details-content'),
      getComputedStyle(details),
      ...(ul ? [getComputedStyle(ul)] : []),
    ];
    return styles.reduce((s, cs) => s + secs(cs.transitionDuration) + secs(cs.animationDuration), 0);
  });

test('WP13.3 Tree: expand/collapse animates (CSS only)', async ({ page }) => {
  await page.goto(OPEN);
  expect(await motion(page)).toBeGreaterThan(0);
});

test('WP13.3 Tree: no expand/collapse animation under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(OPEN);
  await expect(page.locator('summary.ocx-tree__row').first()).toBeVisible(); // guard: <details> directories exist
  expect(await motion(page)).toBe(0);
});

test('WP13.3 Tree: names and descriptions render at 12px or larger (Lighthouse best-practices font-size)', async ({
  page,
}) => {
  await page.goto(INLINE);
  const fontSize = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await fontSize(row(tree(page, 0), 'c/index.json').locator('.ocx-tree__name'))).toBeGreaterThanOrEqual(12);
  await page.goto(DEFAULT);
  expect(await fontSize(row(tree(page, 0), 'packages/').locator('.ocx-tree__desc'))).toBeGreaterThanOrEqual(12);
});

for (const route of [DEFAULT, OPEN, INLINE, PER_NODE, NO_COLLAPSE])
  for (const theme of ['light', 'dark'] as const) {
    test(`WP13.3 Tree: axe reports no violations on ${route} (${theme})`, async ({ page }) => {
      await page.goto(route);
      await page.evaluate((t) => {
        document.documentElement.dataset['theme'] = t;
      }, theme);
      await settle(page); // axe must read final colours, not a theme crossfade
      await expect(page.locator('.ocx-tree__row .ocx-tree__icon').first()).toBeVisible(); // guard: real rows
      if (route === DEFAULT) await row(tree(page, 0), 'packages/').click(); // include the selected-row colours
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
