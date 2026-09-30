// WP13.2 Tooltip on its story pages: the DOC-EX-34 guarantees (keyboard
// reachable, pointer hoverable, Escape-dismissible) that ocx's Tooltip.vue got
// from reka-ui, re-proven against the native Popover API port.
import { AxeBuilder } from '@axe-core/playwright';
import { settle } from './helpers/settle.ts';
import { expect, test, type Locator, type Page } from '@playwright/test';

const DELAY = 400;
// Story pages (C-125): every term lives in one story; a test visits the story of the term it drives.
const STORY = {
  'OCI digest': 'default',
  'code signature': 'sides',
  Gatekeeper: 'sides',
  'quarantine flag': 'sides',
  'cross-tool convention': 'link-in-the-body',
  'ANSI colors': 'no-hover-delay',
  AMFI: 'long-body',
  'topologically sorted': 'multi-line-body',
} as const;
type Term = keyof typeof STORY;
const TOOLTIPS_PER_STORY = {
  default: 1,
  sides: 3,
  'link-in-the-body': 1,
  'no-hover-delay': 1,
  'long-body': 1,
  'multi-line-body': 1,
};
const visit = (page: Page, term: Term) => page.goto(`/docs/stories/tooltip/${STORY[term]}/`);

const trigger = (page: Page, term: Term) => page.getByRole('button', { name: term, exact: true });
async function popup(page: Page, term: Term): Promise<Locator> {
  const id = await trigger(page, term).getAttribute('aria-describedby');
  expect(id, `${term}: trigger has aria-describedby`).toBeTruthy();
  return page.locator(`[id="${id}"]`);
}
const isOpen = (el: Locator) => el.evaluate((e) => e.matches(':popover-open'));
async function openByFocus(page: Page, term: Term): Promise<Locator> {
  const t = trigger(page, term);
  await t.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await t.focus();
  const p = await popup(page, term);
  await expect.poll(() => isOpen(p)).toBe(true);
  // Measure the settled box, not a frame of the 120ms entrance slide.
  await p.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  return p;
}
type Box = { x: number; y: number; width: number; height: number };
// Separation between two boxes along their separating axis (negative = overlap).
const gap = (a: Box, b: Box) =>
  Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height));
// Side offset (8px) plus arrow; a popup further away than this is not anchored to its trigger.
const MAX_GAP = 24;
// Which side of trigger box `t` popup box `p` sits on (1px rounding slack).
const sideOf = (t: Box, p: Box) =>
  p.y + p.height <= t.y + 1
    ? 'top'
    : p.y >= t.y + t.height - 1
      ? 'bottom'
      : p.x + p.width <= t.x + 1
        ? 'left'
        : 'right';
const noHover = (name: string) => test.skip(name === 'mobile', 'touch devices have no hover');

// The default story holds 'OCI digest'; a test on another term visits that term's story itself.
test.beforeEach(({ page }) => visit(page, 'OCI digest'));

test('WP13.2 Tooltip: Tab reaches the trigger and opens the popup, no mouse involved (DOC-EX-34)', async ({ page }) => {
  const t = trigger(page, 'OCI digest');
  for (let i = 0; i < 200 && !(await t.evaluate((e) => e === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(t).toBeFocused();
  await expect.poll(async () => isOpen(await popup(page, 'OCI digest'))).toBe(true);
  await expect(await popup(page, 'OCI digest')).toBeVisible();
});

test('WP13.2 Tooltip: hover opens the popup after delayDuration (400ms), not before (DOC-EX-34)', async ({
  page,
}, testInfo) => {
  noHover(testInfo.project.name);
  const t = trigger(page, 'OCI digest');
  const p = await popup(page, 'OCI digest');
  await t.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  // Timestamp pointerover and the open toggle in the page: a slow runner can only lengthen the gap, never
  // shorten it, so "not before the delay" cannot flake the way a test-side sleep-then-check does.
  await p.evaluate((el) => {
    el.parentElement!.addEventListener('pointerover', () => (el.dataset['over'] ||= String(performance.now())));
    el.addEventListener('toggle', (e) => {
      if ((e as ToggleEvent).newState === 'open') el.dataset['opened'] ||= String(performance.now());
    });
  });
  await t.hover();
  await expect.poll(() => isOpen(p)).toBe(true);
  const waited = await p.evaluate((el) => Number(el.dataset['opened']) - Number(el.dataset['over']));
  // ponytail: 5ms slack for timer/clock granularity; setTimeout never fires early.
  expect(waited).toBeGreaterThanOrEqual(DELAY - 5);
});

test('WP13.2 Tooltip: moving the pointer from the trigger onto the popup keeps it open; its link stays usable (DOC-EX-34)', async ({
  page,
}, testInfo) => {
  noHover(testInfo.project.name);
  await visit(page, 'cross-tool convention');
  const t = trigger(page, 'cross-tool convention');
  const p = await popup(page, 'cross-tool convention');
  await t.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await t.hover();
  await expect.poll(() => isOpen(p)).toBe(true);
  const link = p.getByRole('link', { name: 'no-color.org' });
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 10 });
  await page.waitForTimeout(500);
  expect(await isOpen(p)).toBe(true);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://no-color.org/');
});

test('WP13.2 Tooltip: pointer leaving the trigger closes the popup (DOC-EX-34)', async ({ page }, testInfo) => {
  noHover(testInfo.project.name);
  const t = trigger(page, 'OCI digest');
  const p = await popup(page, 'OCI digest');
  await t.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await t.hover();
  await expect.poll(() => isOpen(p)).toBe(true);
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height - 5, { steps: 5 });
  await expect.poll(() => isOpen(p)).toBe(false);
});

test('WP13.2 Tooltip: pointer leaving does not close a popup while its trigger is focused (WCAG 1.4.13 persistent)', async ({
  page,
}, testInfo) => {
  noHover(testInfo.project.name);
  const p = await openByFocus(page, 'OCI digest');
  await trigger(page, 'OCI digest').hover();
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height - 5, { steps: 5 });
  await page.waitForTimeout(500);
  expect(await isOpen(p)).toBe(true);
});

test('WP13.2 Tooltip: Escape closes the popup and focus stays on the trigger (DOC-EX-34)', async ({ page }) => {
  const p = await openByFocus(page, 'OCI digest');
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(p)).toBe(false);
  await expect(trigger(page, 'OCI digest')).toBeFocused();
});

test('WP13.2 Tooltip: Escape closes a hover-opened popup (DOC-EX-34)', async ({ page }, testInfo) => {
  noHover(testInfo.project.name);
  const t = trigger(page, 'OCI digest');
  const p = await popup(page, 'OCI digest');
  await t.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await t.hover();
  await expect.poll(() => isOpen(p)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(p)).toBe(false);
});

test('WP13.2 Tooltip: blur closes the popup (Tab away) (DOC-EX-34)', async ({ page }) => {
  const p = await openByFocus(page, 'OCI digest');
  await page.keyboard.press('Tab');
  await expect(trigger(page, 'OCI digest')).not.toBeFocused();
  await expect.poll(() => isOpen(p)).toBe(false);
});

test('WP13.2 Tooltip: only one popup is open at a time', async ({ page }, testInfo) => {
  noHover(testInfo.project.name);
  await visit(page, 'code signature');
  const a = await openByFocus(page, 'code signature');
  const t = trigger(page, 'Gatekeeper');
  const b = await popup(page, 'Gatekeeper');
  await t.hover();
  await expect.poll(() => isOpen(b)).toBe(true);
  expect(await isOpen(a)).toBe(false);
  const open = await page
    .locator('[role="tooltip"]')
    .evaluateAll((els) => els.filter((e) => e.matches(':popover-open')).length);
  expect(open).toBe(1);
});

test('WP13.2 Tooltip: every trigger is described by its role="tooltip" popup (aria-describedby wiring)', async ({
  page,
}) => {
  for (const [term, text] of [
    ['OCI digest', /A SHA-256 content fingerprint/],
    ['code signature', /A cryptographic seal/],
    ['Gatekeeper', /A macOS subsystem/],
    ['quarantine flag', /com\.apple\.quarantine/],
    ['cross-tool convention', /Defined at no-color\.org/],
    ['ANSI colors', /ECMA-48/],
    ['topologically sorted', /Kahn.s algorithm .* final list\./s],
  ] as const) {
    await visit(page, term);
    await expect(await popup(page, term)).toHaveAttribute('role', 'tooltip');
    await expect(trigger(page, term)).toHaveAccessibleDescription(text);
  }
});

test('WP13.2 Tooltip: tooltips nest inside prose <p> with phrasing content only (inline use)', async ({ page }) => {
  for (const [name, count] of Object.entries(TOOLTIPS_PER_STORY)) {
    await page.goto(`/docs/stories/tooltip/${name}/`);
    const roots = page.locator('[data-ocx-tooltip]');
    await expect(roots, name).toHaveCount(count);
    const bad = await roots.evaluateAll((els) =>
      els.flatMap((root) => {
        const errs: string[] = [];
        if (root.parentElement?.tagName !== 'P')
          errs.push(`${root.textContent?.slice(0, 20)}: parent is ${root.parentElement?.tagName}`);
        for (const el of [root, ...root.querySelectorAll('*')])
          if (/^(DIV|P|UL|OL|LI|SECTION|FIGURE|TABLE|PRE|BLOCKQUOTE|H[1-6])$/.test(el.tagName))
            errs.push(`block <${el.tagName}>`);
        return errs;
      }),
    );
    expect(bad, name).toEqual([]);
  }
  await visit(page, 'OCI digest');
  // The <p> is not split by the parser: prose on both sides of the term shares one paragraph.
  await expect(page.locator('p', { has: trigger(page, 'OCI digest') })).toContainText(
    /pinned by .* not by version ranges/s,
  );
});

test('WP13.2 Tooltip: trigger is dashed-underlined inline text with cursor: help', async ({ page }) => {
  const style = await trigger(page, 'OCI digest').evaluate((e) => {
    const cs = getComputedStyle(e);
    return {
      display: cs.display,
      cursor: cs.cursor,
      dashed: [cs.borderBottomStyle, cs.textDecorationStyle].includes('dashed'),
    };
  });
  expect(style).toEqual({ display: expect.stringMatching(/^inline/), cursor: 'help', dashed: true });
});

for (const [term, side] of [
  ['OCI digest', 'top'],
  ['code signature', 'bottom'],
] as const) {
  test(`WP13.2 Tooltip: side="${side}" places the popup ${side === 'top' ? 'above' : 'below'} the trigger, uncovered by page chrome (top layer)`, async ({
    page,
  }) => {
    await visit(page, term);
    // The story puts the term on its first line: give the popup room above, or `top` rightly flips.
    await page.addStyleTag({ content: '#story { padding-block-start: 240px }' });
    const p = await openByFocus(page, term);
    await expect(p).toHaveAttribute('data-side', side);
    const [tb, pb] = [await trigger(page, term).boundingBox(), await p.boundingBox()];
    if (side === 'top') expect(pb!.y + pb!.height).toBeLessThanOrEqual(tb!.y);
    else expect(pb!.y).toBeGreaterThanOrEqual(tb!.y + tb!.height);
    expect(gap(tb!, pb!)).toBeLessThanOrEqual(MAX_GAP);
    const hit = await p.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    expect(hit).toBe(true);
  });
}

for (const [term, side] of [
  ['Gatekeeper', 'right'],
  ['quarantine flag', 'left'],
] as const) {
  test(`WP13.2 Tooltip: side="${side}" popup sits next to its trigger without covering it, inside the viewport (position-try flip allowed)`, async ({
    page,
  }, testInfo) => {
    await visit(page, term);
    const p = await openByFocus(page, term);
    const [tb, pb] = [await trigger(page, term).boundingBox(), await p.boundingBox()];
    // data-side names the side actually used after a position-try flip (Radix semantics).
    const used = await p.getAttribute('data-side');
    if (testInfo.project.name !== 'mobile') expect(used).toBe(side);
    expect(sideOf(tb!, pb!)).toBe(used);
    expect(gap(tb!, pb!)).toBeGreaterThanOrEqual(0);
    expect(gap(tb!, pb!)).toBeLessThanOrEqual(MAX_GAP);
    const vw = page.viewportSize()!.width;
    expect(pb!.x).toBeGreaterThanOrEqual(0);
    expect(pb!.x + pb!.width).toBeLessThanOrEqual(vw);
  });
}

test('WP13.2 Tooltip: the 12×6 arrow is visible between the popup and its trigger', async ({ page }) => {
  for (const term of ['OCI digest', 'code signature', 'Gatekeeper', 'quarantine flag'] as const) {
    await visit(page, term);
    const p = await openByFocus(page, term);
    const arrow = p.locator('.ocx-tooltip__arrow');
    await expect(arrow).toBeVisible();
    const [tb, pb, ab] = [await trigger(page, term).boundingBox(), await p.boundingBox(), await arrow.boundingBox()];
    const side = sideOf(tb!, pb!);
    expect(side, term).toBe(await p.getAttribute('data-side'));
    expect(
      [ab!.width, ab!.height].sort((a, b) => a - b),
      term,
    ).toEqual([6, 12]);
    // The arrow lies in the gap: outside the popup box, on the trigger's side of it.
    expect(sideOf(pb!, ab!), term).toBe({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side]);
    expect(sideOf(tb!, ab!), term).toBe(side);
    await page.keyboard.press('Escape');
  }
});

test('WP13.2 Tooltip: Tab from the trigger into a link in the popup keeps it open; Escape there closes it and refocuses the trigger', async ({
  page,
}) => {
  await visit(page, 'cross-tool convention');
  const p = await openByFocus(page, 'cross-tool convention');
  await page.keyboard.press('Tab');
  await expect(p.getByRole('link', { name: 'no-color.org' })).toBeFocused();
  expect(await isOpen(p)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => isOpen(p)).toBe(false);
  await expect(trigger(page, 'cross-tool convention')).toBeFocused();
});

test('WP13.2 Tooltip: the long AMFI body stays inside the viewport', async ({ page }) => {
  await visit(page, 'AMFI');
  const p = await openByFocus(page, 'AMFI');
  const pb = (await p.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(pb.x).toBeGreaterThanOrEqual(0);
  expect(pb.x + pb.width).toBeLessThanOrEqual(vp.width);
  expect(pb.y).toBeGreaterThanOrEqual(0);
  expect(pb.y + pb.height).toBeLessThanOrEqual(vp.height);
});

test('WP13.2 Tooltip: popup has a 2px radius (sharp system)', async ({ page }) => {
  const p = await openByFocus(page, 'OCI digest');
  expect(await p.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('2px');
});

test('WP13.2 Tooltip: 120ms entrance animation, none under prefers-reduced-motion', async ({ page }) => {
  const durations = (el: Locator) =>
    el.evaluate((e) => {
      const cs = getComputedStyle(e);
      return `${cs.animationDuration},${cs.transitionDuration}`
        .split(',')
        .map((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000));
    });
  const p = await openByFocus(page, 'OCI digest');
  expect(await durations(p)).toContain(120);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visit(page, 'OCI digest');
  const q = await openByFocus(page, 'OCI digest');
  expect((await durations(q)).every((d) => d === 0)).toBe(true);
});

for (const theme of ['light', 'dark'] as const) {
  test(`WP13.2 Tooltip: axe reports no violations with a tooltip open (${theme}) (DOC-EX-34)`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('starlight-theme', t), theme);
    await visit(page, 'cross-tool convention');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await openByFocus(page, 'cross-tool convention');
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
