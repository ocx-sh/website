// The glossary on its story pages and demo page: one `a.ocx-term` per linked usage, a popup that opens on focus at
// once and on hover after 400 ms, is hoverable, dismissible and persistent (WCAG 1.4.13), anchored to its term,
// and a plain working link without script or when the definitions fail to load.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { settle } from './helpers/settle.ts';

const DELAY = 400;
const STORY = '/docs/stories/glossary/default/';
const SKIPPED = '/docs/stories/glossary/skipped/';
const DEMO = '/docs/components/glossary/';
const GLOSSARY_PAGE = '/docs/components/glossary-terms/';

const term = (page: Page, name: string) => page.locator('a.ocx-term', { hasText: new RegExp(`^${name}$`) });
const popup = (page: Page) => page.locator('#ocx-term-tip');
// Not `locator.evaluate`: that waits for the element, and a popup that never opened has none.
const isOpen = (_: Locator) =>
  _.page().evaluate(() => document.getElementById('ocx-term-tip')?.matches(':popover-open') ?? false);
const noHover = (name: string) => test.skip(name === 'mobile', 'touch devices have no hover');
const escape = (page: Page) => page.keyboard.press('Escape');

/** Tab until `el` has focus (a canvas page has a short tab order). */
async function tabTo(page: Page, el: Locator) {
  for (let i = 0; i < 40 && !(await el.evaluate((e) => e === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(el).toBeFocused();
}
async function openByFocus(page: Page, name: string) {
  await term(page, name).focus();
  await expect.poll(() => isOpen(popup(page))).toBe(true);
  await settle(page);
}

test.describe('the markup', () => {
  test('every linked term is one element: an anchor with a class and an href, nothing else', async ({ page }) => {
    await page.goto(DEMO);
    const shapes = await page.locator('a.ocx-term').evaluateAll((as) =>
      as.map((a) => ({
        attrs: a.getAttributeNames().sort().join(),
        children: a.childElementCount,
        parent: a.parentElement?.tagName,
        text: a.textContent,
      })),
    );
    expect(shapes.length).toBe(12);
    for (const s of shapes) {
      expect(s.attrs, s.text ?? '').toBe('class,href');
      expect(s.children).toBe(0);
      expect(s.parent).toBe('P');
    }
  });

  test('each link targets its entry on the glossary page, which has the anchor', async ({ page }) => {
    await page.goto(DEMO);
    const hrefs = await page.locator('a.ocx-term').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    expect(hrefs).toContain(`${GLOSSARY_PAGE}#sigstore`);
    for (const href of hrefs) {
      const [path, id] = href.split('#') as [string, string];
      expect(path).toBe(GLOSSARY_PAGE);
      await page.goto(href);
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
  });

  test('the glossary page links none of its own terms; a probe page links nothing', async ({ page }) => {
    await page.goto(GLOSSARY_PAGE);
    await expect(page.locator('a.ocx-term')).toHaveCount(0);
    await page.goto('/docs/probe/long/');
    await expect(page.locator('a.ocx-term')).toHaveCount(0);
  });

  test('code, headings, link text and a second usage stay plain', async ({ page }) => {
    await page.goto(SKIPPED);
    await expect(page.locator('a.ocx-term')).toHaveCount(1);
    await expect(page.locator('a.ocx-term')).toHaveText('Sigstore');
    await expect(page.locator('h3 a')).toHaveCount(0);
  });

  test('a term whose row excludes the page is not linked there; other terms still are', async ({ page }) => {
    await page.goto('/docs/probe/scope/');
    await expect(page.locator('a.ocx-term')).toHaveText(['image index', 'Sigstore']);
    await page.goto(DEMO);
    await expect(term(page, 'descriptor')).toHaveCount(1);
  });

  test('glossary.json is {id: [term, definition]} for every term', async ({ request }) => {
    const res = await request.get('/docs/glossary.json');
    expect(res.ok()).toBe(true);
    const data = (await res.json()) as Record<string, [string, string]>;
    expect(Object.keys(data)).toHaveLength(12);
    expect(data['sigstore']?.[0]).toBe('Sigstore');
    expect(data['sigstore']?.[1]).toContain('Fulcio');
  });

  test('the term is styled as a link that is not an ordinary one: dashed underline in the prose colour', async ({
    page,
  }) => {
    await page.goto(STORY);
    const style = await term(page, 'Sigstore').evaluate((a) => {
      const s = getComputedStyle(a);
      return {
        line: s.textDecorationLine,
        style: s.textDecorationStyle,
        color: s.color,
        parent: getComputedStyle(a.parentElement!).color,
      };
    });
    expect(style.line).toBe('underline');
    expect(style.style).toBe('dashed');
    expect(style.color).toBe(style.parent);
  });
});

test.describe('the popup', () => {
  test.beforeEach(({ page }) => page.goto(STORY));

  test('Tab reaches a term and opens its popup at once, with the term and its definition', async ({ page }) => {
    const t = term(page, 'Sigstore');
    await tabTo(page, t);
    await expect.poll(() => isOpen(popup(page))).toBe(true);
    await expect(popup(page)).toBeVisible();
    await expect(popup(page)).toHaveAttribute('role', 'tooltip');
    await expect(popup(page).locator('strong')).toHaveText('Sigstore');
    await expect(popup(page)).toContainText('Fulcio');
    await expect(t).toHaveAttribute('aria-describedby', 'ocx-term-tip');
  });

  test('the popup sits on the open term, above it, and its link is not in the popup', async ({ page }) => {
    await openByFocus(page, 'Fulcio');
    const t = (await term(page, 'Fulcio').boundingBox())!;
    const p = (await popup(page).boundingBox())!;
    const gap = Math.max(p.x - (t.x + t.width), t.x - (p.x + p.width), p.y - (t.y + t.height), t.y - (p.y + p.height));
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(24);
    await expect(popup(page).locator('a, button')).toHaveCount(0);
  });

  test('hover opens it after 400 ms, not before', async ({ page }, testInfo) => {
    noHover(testInfo.project.name);
    await page.evaluate(() => {
      document.addEventListener('pointerover', (e) => {
        if ((e.target as Element).closest('a.ocx-term'))
          (window as unknown as { over: number }).over ||= performance.now();
      });
      new MutationObserver(() => {
        const el = document.getElementById('ocx-term-tip');
        if (el?.matches(':popover-open')) (window as unknown as { opened: number }).opened ||= performance.now();
      }).observe(document, { subtree: true, attributes: true, childList: true });
    });
    await term(page, 'Rekor').hover();
    await expect.poll(() => isOpen(popup(page))).toBe(true);
    const waited = await page.evaluate(
      () => (window as unknown as { opened: number }).opened - (window as unknown as { over: number }).over,
    );
    expect(waited).toBeGreaterThanOrEqual(DELAY - 5);
  });

  test('the pointer can move from the term onto the popup and it stays open; leaving closes it', async ({
    page,
  }, testInfo) => {
    noHover(testInfo.project.name);
    await term(page, 'Rekor').hover();
    await expect.poll(() => isOpen(popup(page))).toBe(true);
    const box = (await popup(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await page.waitForTimeout(500);
    expect(await isOpen(popup(page))).toBe(true);
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height - 5, { steps: 5 });
    await expect.poll(() => isOpen(popup(page))).toBe(false);
  });

  test('Escape closes it and focus stays on the term (dismissible)', async ({ page }) => {
    await openByFocus(page, 'Sigstore');
    await escape(page);
    await expect.poll(() => isOpen(popup(page))).toBe(false);
    await expect(term(page, 'Sigstore')).toBeFocused();
    await expect(term(page, 'Sigstore')).not.toHaveAttribute('aria-describedby');
  });

  test('Escape closes a popup that hover opened', async ({ page }, testInfo) => {
    noHover(testInfo.project.name);
    await term(page, 'Rekor').hover();
    await expect.poll(() => isOpen(popup(page))).toBe(true);
    await escape(page);
    await expect.poll(() => isOpen(popup(page))).toBe(false);
  });

  test('blur closes it', async ({ page }) => {
    await openByFocus(page, 'Fulcio');
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await expect.poll(() => isOpen(popup(page))).toBe(false);
  });

  test('the pointer leaving does not close a popup while its term is focused (persistent)', async ({
    page,
  }, testInfo) => {
    noHover(testInfo.project.name);
    await openByFocus(page, 'Sigstore');
    await term(page, 'Sigstore').hover();
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height - 5, { steps: 5 });
    await page.waitForTimeout(500);
    expect(await isOpen(popup(page))).toBe(true);
  });

  test('only one popup is open: focusing another term moves it', async ({ page }) => {
    await openByFocus(page, 'Sigstore');
    await openByFocus(page, 'Rekor');
    await expect(page.locator('#ocx-term-tip')).toHaveCount(1);
    await expect(popup(page).locator('strong')).toHaveText('Rekor');
    await expect(term(page, 'Sigstore')).not.toHaveAttribute('aria-describedby');
    await expect(term(page, 'Rekor')).toHaveAttribute('aria-describedby', 'ocx-term-tip');
  });

  test('a popup that animates respects reduced motion: its transitions take no time', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openByFocus(page, 'Sigstore');
    const durations = await popup(page).evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(
      durations.split(',').every((d) => parseFloat(d) === 0),
      durations,
    ).toBe(true);
  });

  test('a popup has no accessibility violations with its term focused (axe)', async ({ page }) => {
    await openByFocus(page, 'Sigstore');
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('without the popup', () => {
  test('without script a term is a plain link to its glossary entry', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
    const page = await context.newPage();
    await page.goto(STORY);
    await page.locator('a.ocx-term', { hasText: 'Fulcio' }).click();
    await expect(page).toHaveURL(new RegExp(`${GLOSSARY_PAGE}#fulcio$`));
    await expect(page.locator('#fulcio')).toBeVisible();
    await context.close();
  });

  test('when glossary.json fails to load a term stays a plain link and nothing is reported', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.route('**/glossary.json', (route) => route.abort());
    await page.goto(STORY);
    await term(page, 'Sigstore').focus();
    await page.waitForTimeout(DELAY + 200);
    expect(await page.locator('#ocx-term-tip').count()).toBe(0);
    await expect(term(page, 'Sigstore')).toHaveAttribute('href', `${GLOSSARY_PAGE}#sigstore`);
    expect(errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e))).toEqual([]);
  });

  test('a page that links a term has no accessibility violations (axe)', async ({ page }) => {
    await page.goto(DEMO);
    // `landmark-unique` is every page with story canvases (their iframes hold a <main> each), the Tooltip page included.
    const { violations } = await new AxeBuilder({ page }).disableRules(['landmark-unique']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test('an aside title is never a link, and the page has no accessibility violations (axe)', async ({ page }) => {
  await page.goto('/docs/probe/terms/');
  await expect(page.locator('a.ocx-term').first()).toBeVisible();
  await expect(page.locator('.starlight-aside__title')).toHaveCount(1);
  await expect(page.locator('.starlight-aside__title a')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
