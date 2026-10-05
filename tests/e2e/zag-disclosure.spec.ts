// Z3 disclosure on Zag: Collapsible (C-140) and Accordion (C-141) on their story pages (C-125), held
// to the common wrapper contract C-130: (c) first paint is final, (d) APG keyboard, (e) axe in each
// state, (h) no leak over open/close cycles. Terminal's collapse (C-142) keeps its own spec.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { repaint } from './helpers/repaint.ts';
import { settle } from './helpers/settle.ts';

// Each component has a `default` story (the demo, with an event log) and a `states` story.
const story = (name: string, which: 'default' | 'states') => `/docs/stories/${name}/${which}/`;
const PAGES = {
  collapsible: {
    default: story('collapsible', 'default'),
    states: story('collapsible', 'states'),
    chunk: '**/collapsible.zag*.js',
  },
  accordion: {
    default: story('accordion', 'default'),
    states: story('accordion', 'states'),
    chunk: '**/accordion.zag*.js',
  },
} as const;
type Name = keyof typeof PAGES;

const roots = (page: Page, name: Name) => page.locator(`main [data-zag-root="${name}"]`);
const collapsibleDemo = (page: Page) => page.locator('#story [data-zag-root="collapsible"]');
const accordionDemo = (page: Page) => page.locator('#story [data-zag-root="accordion"]');
const itemTrigger = (root: Locator, value: string) =>
  root.locator(`[data-part="item-trigger"][id$=":trigger:${value}"]`);

test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');
test.use({ reducedMotion: 'reduce' });

async function screenshots(page: Page, name: Name): Promise<Buffer[]> {
  const shots: Buffer[] = [];
  for (const root of await roots(page, name).all()) shots.push(await root.screenshot({ animations: 'disabled' }));
  return shots;
}

for (const name of Object.keys(PAGES) as Name[])
  for (const which of ['default', 'states'] as const) {
    const path = PAGES[name][which];
    const { chunk } = PAGES[name];

    test(`C-130c ${name}/${which}: first paint is final (chunk blocked vs live, pixel-exact)`, async ({
      page,
    }, info) => {
      await page.route(chunk, (r) => r.abort());
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(roots(page, name)).not.toHaveCount(0);
      const before = await screenshots(page, name);
      await page.unroute(chunk);
      for (const root of await roots(page, name).all()) {
        await root.hover();
        await expect(root).toHaveAttribute('data-zag-state', 'live');
      }
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await repaint(page);
      const after = await screenshots(page, name);
      expect(after.length).toBe(before.length);
      for (const [i, shot] of after.entries()) {
        if (shot.equals(before[i]!)) continue;
        // Both shots in the report, so a failure shows which region moved.
        await info.attach(`${name}-${which}-root-${i}-ssr.png`, { body: before[i]!, contentType: 'image/png' });
        await info.attach(`${name}-${which}-root-${i}-live.png`, { body: shot, contentType: 'image/png' });
      }
      for (const [i, shot] of after.entries()) expect(shot.equals(before[i]!), `${name}/${which} root ${i}`).toBe(true);
    });

    test(`C-130c ${name}/${which}: the story lays out identically with images blocked`, async ({ page, context }) => {
      const layout = async () => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        return page.evaluate(() =>
          [...document.querySelectorAll('body *:not(mobile-starlight-toc *)')].flatMap((e) => {
            const r = e.getBoundingClientRect();
            return r.width || r.height
              ? [`${e.tagName} ${[r.x, r.y, r.width, r.height].map(Math.round).join(',')}`]
              : [];
          }),
        );
      };
      const loaded = await layout();
      await context.route('**/*', (r) => (r.request().resourceType() === 'image' ? r.abort() : r.continue()));
      expect(await layout()).toEqual(loaded);
    });

    for (const theme of ['light', 'dark'] as const) {
      test(`C-130e ${name}/${which}: axe clean as rendered, and with a section toggled (${theme})`, async ({
        page,
      }) => {
        await page.goto(path);
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await settle(page); // axe must read final colours, not a theme crossfade
        const scan = async () => {
          const { violations } = await new AxeBuilder({ page }).include('main').analyze();
          return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        };
        expect(await scan()).toEqual([]);
        // The default story toggles its demo; in `states` the first closed root (a locked trigger would stall click()).
        const toggled =
          name === 'collapsible'
            ? which === 'default'
              ? collapsibleDemo(page).locator('[data-part="trigger"]')
              : page.locator('main [data-part="trigger"]', { hasText: 'Closed' })
            : which === 'default'
              ? itemTrigger(accordionDemo(page), 'select')
              : itemTrigger(roots(page, 'accordion').filter({ hasText: 'Closed one' }), 'a');
        await toggled.click();
        await expect(toggled).toHaveAttribute('aria-expanded', 'true');
        expect(await scan()).toEqual([]);
      });
    }
  }

test.describe('C-140 Collapsible', () => {
  test('C-140 click toggles aria-expanded and hidden; ocx:collapsible:change reaches the event log', async ({
    page,
  }) => {
    await page.goto(PAGES.collapsible.default);
    const root = collapsibleDemo(page);
    const trigger = root.locator('[data-part="trigger"]');
    const content = root.locator('[data-part="content"]');
    await expect(content).toBeHidden();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(content).toBeVisible();
    await expect(page.locator('#story [role="log"] li').first()).toHaveText('ocx:collapsible:change {"open":true}');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(content).toBeHidden();
  });

  test('C-130d C-140 APG disclosure: Enter and Space on the focused trigger toggle it', async ({ page }) => {
    await page.goto(PAGES.collapsible.default);
    const trigger = collapsibleDemo(page).locator('[data-part="trigger"]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
  });

  test('C-140 disabled: activation changes nothing', async ({ page }) => {
    await page.goto(PAGES.collapsible.states);
    const root = roots(page, 'collapsible').filter({ has: page.locator('[aria-disabled="true"]') });
    const trigger = root.locator('[data-part="trigger"]');
    // force: Playwright waits for an aria-disabled element to become enabled.
    await trigger.click({ force: true });
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    await trigger.click({ force: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(root.locator('[data-part="content"]')).toBeHidden();
  });

  // A States root: the demo's event log grows by design and would read as a node leak.
  test('C-130h collapsible.zag leaks nothing over 20 open/close cycles', async ({ page }) => {
    await page.goto(PAGES.collapsible.states);
    const trigger = page.locator('.showcase-states [data-part="trigger"]', { hasText: 'Closed' });
    await expectNoLeak(page, async () => {
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });
});

test.describe('C-141 Accordion', () => {
  test('C-141 single mode: opening one closes the other; ocx:accordion:change {value} is logged', async ({ page }) => {
    await page.goto(PAGES.accordion.default);
    const root = accordionDemo(page);
    await itemTrigger(root, 'remove').click();
    await expect(itemTrigger(root, 'remove')).toHaveAttribute('aria-expanded', 'true');
    await expect(itemTrigger(root, 'install')).toHaveAttribute('aria-expanded', 'false');
    await expect(root.locator('[id$=":content:install"]')).toBeHidden();
    await expect(root.locator('[id$=":content:remove"]')).toBeVisible();
    await expect(page.locator('#story [role="log"] li').first()).toHaveText(
      'ocx:accordion:change {"value":["remove"]}',
    );
  });

  test('C-130d C-141 APG accordion: arrows move focus (wrapping), Home/End jump, Enter/Space open', async ({
    page,
  }) => {
    await page.goto(PAGES.accordion.default);
    const root = accordionDemo(page);
    const [install, select, remove] = ['install', 'select', 'remove'].map((v) => itemTrigger(root, v)) as [
      Locator,
      Locator,
      Locator,
    ];
    await install.focus();
    await page.keyboard.press('ArrowDown');
    await expect(select).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(remove).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(install).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(remove).toBeFocused();
    await page.keyboard.press('Home');
    await expect(install).toBeFocused();
    await page.keyboard.press('End');
    await expect(remove).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(remove).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(select).toBeFocused();
    await page.keyboard.press('Space');
    await expect(select).toHaveAttribute('aria-expanded', 'true');
    await expect(remove).toHaveAttribute('aria-expanded', 'false');
  });

  test('C-141 the first key after focusing an idle accordion is not lost (focus before live)', async ({ page }) => {
    await page.goto(PAGES.accordion.default);
    const root = accordionDemo(page);
    await expect(root).toHaveAttribute('data-zag-state', 'idle');
    await itemTrigger(root, 'install').focus();
    await page.keyboard.press('ArrowDown');
    await expect(itemTrigger(root, 'select')).toBeFocused();
  });

  // collapsible={false}: the open item's trigger is aria-disabled (Playwright will not click it) and
  // the lock moves with the open item once the machine is live.
  test('C-141 collapsible={false}: the open trigger is aria-disabled, and the lock moves', async ({ page }) => {
    await page.goto(PAGES.accordion.states);
    const root = roots(page, 'accordion').filter({ hasText: 'Pinned open' });
    const [a, b] = [itemTrigger(root, 'a'), itemTrigger(root, 'b')];
    await expect(a).toHaveAttribute('aria-disabled', 'true');
    await expect(b).not.toHaveAttribute('aria-disabled');
    await b.click();
    await expect(b).toHaveAttribute('aria-expanded', 'true');
    await expect(b).toHaveAttribute('aria-disabled', 'true');
    await expect(a).toHaveAttribute('aria-expanded', 'false');
    await expect(a).not.toHaveAttribute('aria-disabled');
  });

  // A States root: the demo's event log grows by design and would read as a node leak. The
  // collapsible one, all closed: a locked (aria-disabled) trigger would stall click() to timeout.
  test('C-130h accordion.zag leaks nothing over 20 open/close cycles', async ({ page }) => {
    await page.goto(PAGES.accordion.states);
    const root = roots(page, 'accordion').filter({ hasText: 'Closed one' });
    const [a, b] = [itemTrigger(root, 'a'), itemTrigger(root, 'b')];
    await expectNoLeak(page, async () => {
      await a.click();
      await expect(a).toHaveAttribute('aria-expanded', 'true');
      await b.click();
      await expect(b).toHaveAttribute('aria-expanded', 'true');
    });
  });
});

// Owner redesign 2026-09-29 (second pass): no frame, one hairline between items, the open item
// wears the accent (focus-coloured start bar, accent-fg title and chevron), the focus ring is the
// square inset one.
test('look: open item wears the accent; no frame, one hairline between items', async ({ page }) => {
  await page.goto(PAGES.accordion.default);
  const look = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#story [data-zag-root="accordion"]')!;
    const probe = (v: string) => {
      const d = document.createElement('div');
      d.style.color = `var(${v})`;
      root.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    };
    const [focus, accentFg, border] = [
      probe('--ocx-color-focus'),
      probe('--ocx-color-accent-fg'),
      probe('--ocx-color-border'),
    ];
    const trig = (v: string) => root.querySelector<HTMLElement>(`[id$=":trigger:${v}"]`)!;
    const st = (el: Element) => getComputedStyle(el);
    const chevron = (v: string) => st(trig(v).querySelector('[data-icon="chevron-down"]')!);
    const items = [...root.querySelectorAll<HTMLElement>('.ocx-accordion__item')];
    return {
      bar: items.map((i) => st(i).boxShadow.includes(focus)),
      title: [st(trig('install')).color === accentFg, st(trig('select')).color === accentFg],
      chevron: [chevron('install').color === accentFg, chevron('install').rotate, chevron('select').rotate],
      openBg: st(trig('install')).backgroundColor === st(trig('select')).backgroundColor,
      rootBorder: st(root).borderTopWidth,
      itemLines: items.map((i) => [st(i).borderTopWidth, st(i).borderBottomWidth, st(i).borderTopColor === border]),
      triggerBorder: st(trig('select')).borderTopWidth,
      focusOffset: parseFloat(st(trig('install')).outlineOffset),
    };
  });
  expect(look.bar).toEqual([true, false, false]);
  expect(look.title).toEqual([true, false]);
  expect(look.chevron).toEqual([true, '180deg', 'none']);
  expect(look.openBg).toBe(true);
  expect(look.rootBorder).toBe('0px');
  expect(look.itemLines).toEqual([
    ['0px', '0px', expect.any(Boolean)],
    ['1px', '0px', true],
    ['1px', '0px', true],
  ]);
  expect(look.triggerBorder).toBe('0px');
  expect(look.focusOffset).toBeLessThan(0);
});

// Open/close motion (ui/disclosure.css): the content box grows while it fades in, and a close runs
// to the end before the content is hidden. The rest of this file runs reduced-motion (durations 0).
test.describe('disclosure motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  const box = (content: Locator) =>
    content.evaluate((el) => ({ h: el.getBoundingClientRect().height, op: +getComputedStyle(el).opacity }));

  test('Collapsible: open grows and fades in, close shrinks then hides', async ({ page }) => {
    await page.goto(PAGES.collapsible.default);
    const root = collapsibleDemo(page);
    await root.locator('[data-part="trigger"]').hover();
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    const content = root.locator('[data-part="content"]');
    await root.locator('[data-part="trigger"]').click();
    const early = await box(content);
    await expect(content).toBeVisible();
    await expect.poll(async () => (await box(content)).h).toBeGreaterThan(early.h);
    const full = await box(content);
    expect(early.h).toBeLessThan(full.h);
    expect(early.op).toBeLessThan(1);
    await root.locator('[data-part="trigger"]').click();
    expect((await box(content)).h).toBeGreaterThan(0);
    await expect(content).toBeHidden();
    await expect(content).toHaveAttribute('hidden', '');
    await expect(content).toHaveCSS('display', 'none');
  });

  test('Accordion: the closing item shrinks then hides; the opening one grows', async ({ page }) => {
    await page.goto(PAGES.accordion.default);
    const root = accordionDemo(page);
    await itemTrigger(root, 'select').hover();
    await expect(root).toHaveAttribute('data-zag-state', 'live');
    const panel = (value: string) => root.locator(`[data-part="item-content"][id$=":content:${value}"]`);
    await expect(panel('install')).toBeVisible();
    await itemTrigger(root, 'select').click();
    const opening = await box(panel('select'));
    await expect.poll(async () => (await box(panel('select'))).h).toBeGreaterThan(opening.h);
    await expect(panel('install')).toBeHidden();
    await expect(panel('install')).toHaveCSS('display', 'none');
  });
});
