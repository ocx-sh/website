// Z6 overlays (C-170…C-174) under C-130: first paint final (c), keyboard per APG (d), axe in each
// state (e), events (g), no leak over open/close (h), live triggers on the story pages (i).
// Leak coverage (C-115): popover.zag, menu.zag, dialog.zag, drawer.zag, tooltip.zag.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';
import { settle } from './helpers/settle.ts';

// Story pages (C-125): `default` holds the logged demo, `states` the StateGrid of live triggers.
const story = (slug: string, name: string) => `/docs/stories/${slug}/${name}/`;
const PAGE = {
  popover: story('popover', 'default'),
  menu: story('action-menu', 'default'),
  dialog: story('dialog', 'default'),
  drawer: story('drawer', 'default'),
  hint: story('hint', 'default'),
};
const STATES = {
  popover: story('popover', 'states'),
  menu: story('action-menu', 'states'),
  dialog: story('dialog', 'states'),
  drawer: story('drawer', 'states'),
  hint: story('hint', 'states'),
};

const demo = (page: Page) => page.locator('.showcase-demo [data-zag-root]').first();
const part = (root: Locator, name: string) => root.locator(`[data-part="${name}"]`);
const live = (root: Locator) => expect(root).toHaveAttribute('data-zag-state', 'live');
const focused = (l: Locator) => l.evaluate((e) => e === document.activeElement);
const focusInside = (l: Locator) => l.evaluate((e) => e.contains(document.activeElement));

/** Every `ocx:*` event dispatched on the page, in order (read with `events(page)`). */
async function recordEvents(page: Page) {
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __events: string[] }).__events = log;
    for (const type of [
      'popover:change',
      'menu:select',
      'menu:change',
      'dialog:change',
      'drawer:change',
      'hint:change',
    ])
      document.addEventListener(`ocx:${type}`, (e) =>
        log.push(`${e.type} ${JSON.stringify((e as CustomEvent).detail)}`),
      );
  });
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: string[] }).__events);

async function axe(page: Page, state: string) {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${state} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Holds the component chunk back until the returned release is called: activations land before start. */
async function holdChunk(page: Page, name: string) {
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route(new RegExp(`/${name}\\.zag\\.[^/]*\\.js$`), async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project; the touch path is its own test');

  test('C-130c first paint is final: pixel-identical before load and after live, on every overlay page', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of Object.values(PAGE)) {
      await page.goto(path);
      const root = demo(page);
      await expect(root).toHaveAttribute('data-zag-state', 'idle');
      const before = await root.screenshot({ animations: 'disabled' });
      await root.hover();
      await live(root);
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const after = await root.screenshot({ animations: 'disabled' });
      expect(after.equals(before), `${path}: first paint differs from the live default state`).toBe(true);
    }
  });

  // On a story page (no Starlight chrome) an open Dialog or Drawer still paints above the page, and its
  // title carries no prose h2 rule; the same overlay inside the doc page's canvas is clipped to that frame.
  for (const name of ['dialog', 'drawer'] as const)
    test(`C-172 C-173 ${name}: open, it paints above the page; its title has no prose rule`, async ({ page }) => {
      await page.setViewportSize({ width: 1000, height: 700 });
      await page.goto(PAGE[name]);
      const root = demo(page);
      await part(root, 'trigger').click();
      const content = part(root, 'content');
      await expect(content).toBeVisible();
      // Both corners of the content's own box hit the content (polled: the drawer slides in).
      const corners = () =>
        content.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [r.top + 4, r.bottom - 4].every((y) => el.contains(document.elementFromPoint(r.left + 4, y)));
        });
      await expect.poll(corners).toBe(true);
      await expect(part(root, 'title')).toHaveCSS('border-top-width', '0px');
    });

  test('C-172 Dialog: exit plays (node stays rendered through a running transition); reduced motion hides at once', async ({
    page,
  }) => {
    await page.goto(PAGE.dialog);
    const root = demo(page);
    const trigger = part(root, 'trigger');
    const content = part(root, 'content');
    const rendered = () =>
      content.evaluate((el) => ({
        shown: getComputedStyle(el).display !== 'none',
        running: el.getAnimations().some((a) => a instanceof CSSTransition),
      }));
    await trigger.focus();
    await live(root);
    await page.keyboard.press('Enter');
    await expect(content).toBeVisible();
    await settle(page);
    await page.keyboard.press('Escape');
    expect(await rendered()).toEqual({ shown: true, running: true });
    await expect(content).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await trigger.click();
    await expect(content).toBeVisible();
    await settle(page);
    await page.keyboard.press('Escape');
    expect(await rendered()).toEqual({ shown: false, running: false });
  });

  test('C-172 Dialog: early click opens it (replay), focus trap, scroll lock, Esc returns focus, events', async ({
    page,
  }) => {
    await page.goto(PAGE.dialog);
    await recordEvents(page);
    const release = await holdChunk(page, 'dialog');
    const root = demo(page);
    const trigger = part(root, 'trigger');
    const content = part(root, 'content');
    await trigger.click();
    await expect(root).toHaveAttribute('data-zag-state', 'loading');
    release();
    await expect(content).toBeVisible();
    await expect(content).toHaveAccessibleName('Remove package');
    await expect(content).toHaveAccessibleDescription("The package leaves this project's lock file.");
    await expect.poll(() => focusInside(content)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(content), `Tab ${i + 1} stays inside`).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await focusInside(content)).toBe(true);
    await axe(page, 'dialog open');
    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
    await expect.poll(() => focused(trigger)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    expect(await events(page)).toEqual(['ocx:dialog:change {"open":true}', 'ocx:dialog:change {"open":false}']);
    // The showcase event log (C-122) lists them too.
    await expect(page.locator('#story .showcase-log__items li')).toHaveCount(2);
  });

  test('C-172 Dialog: keyboard open, outside click closes, close button closes, non-modal keeps the page', async ({
    page,
  }) => {
    await page.goto(PAGE.dialog);
    const root = demo(page);
    const trigger = part(root, 'trigger');
    const content = part(root, 'content');
    await trigger.focus();
    await live(root);
    await page.keyboard.press('Enter');
    await expect(content).toBeVisible();
    await expect.poll(() => focusInside(content)).toBe(true);
    // Zag arms its outside-pointer listener a frame after opening; a reader never clicks faster. The
    // 600ms window covers the exit fade (display holds the node until it ends).
    await expect(async () => {
      await page.mouse.click(4, 400);
      await expect(content).toBeHidden({ timeout: 600 });
    }).toPass();
    await trigger.click();
    await part(root, 'close-trigger').click();
    await expect(content).toBeHidden();
    await expect.poll(() => focused(trigger)).toBe(true);

    await page.goto(STATES.dialog);
    const plain = page.locator('.showcase-states [data-zag-root="dialog"]').nth(1);
    await part(plain, 'trigger').click();
    await expect(part(plain, 'content')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    await expect(part(plain, 'content')).toHaveAttribute('aria-modal', 'false');
    await axe(page, 'non-modal dialog open');
  });

  test('C-173 Drawer: opens at its edge, traps focus, Esc and swipe close, every side', async ({ page }) => {
    await page.goto(PAGE.drawer);
    await recordEvents(page);
    const vw = page.viewportSize()?.width ?? 0;
    const vh = page.viewportSize()?.height ?? 0;
    const root = demo(page);
    const content = part(root, 'content');
    await part(root, 'trigger').click();
    await expect(content).toBeVisible();
    await expect.poll(async () => (await content.boundingBox())?.x).toBe(0);
    await expect.poll(() => focusInside(content)).toBe(true);
    await axe(page, 'drawer open');
    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
    await expect(part(root, 'positioner')).toBeHidden();
    await expect.poll(() => focused(part(root, 'trigger'))).toBe(true);

    // Swipe towards the start edge closes it.
    await part(root, 'trigger').click();
    await expect.poll(async () => (await content.boundingBox())?.x).toBe(0); // enter slide done
    const box = await content.boundingBox();
    if (!box) throw new Error('drawer content has no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let dx = 5; dx <= 240; dx += 5) await page.mouse.move(box.x + box.width / 2 - dx, box.y + box.height / 2);
    await page.mouse.up();
    await expect(content).toBeHidden();
    await expect(part(root, 'positioner')).toBeHidden();
    expect(await events(page)).toEqual([
      'ocx:drawer:change {"open":true}',
      'ocx:drawer:change {"open":false}',
      'ocx:drawer:change {"open":true}',
      'ocx:drawer:change {"open":false}',
    ]);

    await page.goto(STATES.drawer);
    const states = page.locator('.showcase-states [data-zag-root="drawer"]');
    const end = part(states.nth(0), 'content');
    await part(states.nth(0), 'trigger').click();
    await expect
      .poll(
        async () => Math.round((await end.boundingBox())?.x ?? 0) + Math.round((await end.boundingBox())?.width ?? 0),
      )
      .toBe(vw);
    await page.keyboard.press('Escape');
    const bottom = part(states.nth(1), 'content');
    await part(states.nth(1), 'trigger').click();
    await expect
      .poll(async () =>
        Math.round(((await bottom.boundingBox())?.y ?? 0) + ((await bottom.boundingBox())?.height ?? 0)),
      )
      .toBe(vh);
    await page.keyboard.press('Escape');
    await expect(bottom).toBeHidden();
  });

  test('C-170 Popover: opens under its trigger, Esc and outside click close and return focus, events', async ({
    page,
  }) => {
    await page.goto(PAGE.popover);
    await recordEvents(page);
    const root = demo(page);
    const trigger = part(root, 'trigger');
    const content = part(root, 'content');
    await trigger.click();
    await expect(content).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(content).toHaveAccessibleName('Details');
    const t = await trigger.boundingBox();
    await expect.poll(async () => ((await content.boundingBox())?.y ?? 0) >= (t?.y ?? 0) + (t?.height ?? 0)).toBe(true);
    await axe(page, 'popover open');
    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
    await expect.poll(() => focused(trigger)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(content).toBeVisible();
    await expect.poll(() => focusInside(content)).toBe(true);
    // Zag arms its outside-pointer listener a frame after opening; a reader never clicks faster. The
    // 600ms window covers the exit fade (display holds the node until it ends).
    await expect(async () => {
      await page.mouse.click(4, 400);
      await expect(content).toBeHidden({ timeout: 600 });
    }).toPass();
    expect(await events(page)).toEqual([
      'ocx:popover:change {"open":true}',
      'ocx:popover:change {"open":false}',
      'ocx:popover:change {"open":true}',
      'ocx:popover:change {"open":false}',
    ]);

    // Modal: focus is trapped in the panel.
    await page.goto(STATES.popover);
    const modal = page.locator('.showcase-states [data-zag-root="popover"]').nth(2);
    await part(modal, 'trigger').click();
    await expect(part(modal, 'content')).toBeVisible();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    expect(await focusInside(part(modal, 'content'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(part(modal, 'content')).toBeHidden();
  });

  test('C-171 ActionMenu: the first click opens the menu even before the machine has loaded', async ({ page }) => {
    await page.goto(PAGE.menu);
    const release = await holdChunk(page, 'menu');
    const root = demo(page);
    await part(root, 'trigger').click();
    await expect(root).toHaveAttribute('data-zag-state', 'loading');
    release();
    await expect(part(root, 'content')).toBeVisible();
    await expect(part(root, 'trigger')).toHaveAttribute('aria-expanded', 'true');
  });

  test('C-171 ActionMenu: the first Enter on a focused trigger opens the menu before load', async ({ page }) => {
    await page.goto(PAGE.menu);
    const release = await holdChunk(page, 'menu');
    const root = demo(page);
    await part(root, 'trigger').focus();
    await page.keyboard.press('Enter');
    release();
    await expect(part(root, 'content')).toBeVisible();
  });

  test('C-171 ActionMenu: an ArrowDown pressed before load opens the menu on the first item', async ({ page }) => {
    await page.goto(PAGE.menu);
    const release = await holdChunk(page, 'menu');
    const root = demo(page);
    await part(root, 'trigger').focus();
    await page.keyboard.press('ArrowDown');
    release();
    await expect(part(root, 'content')).toBeVisible();
    await expect(root.locator('[data-part="item"][data-highlighted]')).toHaveAttribute('data-value', 'copy');
  });

  test('C-171 ActionMenu: APG keys (arrows, Home/End, typeahead, disabled skipped), select, Esc', async ({ page }) => {
    await page.goto(PAGE.menu);
    await recordEvents(page);
    const root = demo(page);
    const trigger = part(root, 'trigger');
    const content = part(root, 'content');
    const highlighted = () => root.locator('[data-part="item"][data-highlighted]').getAttribute('data-value');
    await trigger.focus();
    await live(root);
    await page.keyboard.press('ArrowDown');
    await expect(content).toBeVisible();
    await expect.poll(() => focused(content)).toBe(true);
    await expect.poll(highlighted).toBe('copy');
    await page.keyboard.press('ArrowDown');
    await expect.poll(highlighted).toBe('pin');
    await page.keyboard.press('End');
    await expect.poll(highlighted).toBe('remove'); // `publish` is disabled
    await page.keyboard.press('Home');
    await expect.poll(highlighted).toBe('copy');
    await page.keyboard.press('p');
    await expect.poll(highlighted).toBe('pin');
    await expect(content).toHaveAttribute('aria-activedescendant', /pin/);
    await axe(page, 'menu open');
    await page.keyboard.press('Enter');
    await expect(content).toBeHidden();
    await expect.poll(() => focused(trigger)).toBe(true);
    await page.keyboard.press('ArrowDown');
    await expect(content).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
    await expect.poll(() => focused(trigger)).toBe(true);
    await trigger.click();
    await root.locator('[data-part="item"][data-value="remove"]').click();
    await expect(content).toBeHidden();
    expect((await events(page)).filter((e) => e.startsWith('ocx:menu:select'))).toEqual([
      'ocx:menu:select {"value":"pin"}',
      'ocx:menu:select {"value":"remove"}',
    ]);
    expect(await events(page)).toContain('ocx:menu:change {"open":true}');
  });

  test('C-171 ActionMenu context mode: right-click on the target opens the menu at the pointer', async ({ page }) => {
    await page.goto(STATES.menu);
    const root = page.locator('.ocx-ui-action-menu[data-context]');
    const target = part(root, 'context-trigger');
    await target.hover();
    await live(root);
    const box = await target.boundingBox();
    if (!box) throw new Error('no target box');
    await page.mouse.click(box.x + 10, box.y + 10, { button: 'right' });
    const content = part(root, 'content');
    await expect(content).toBeVisible();
    await expect(content).toHaveAccessibleName('Package actions');
    await expect.poll(async () => Math.abs(((await content.boundingBox())?.x ?? 0) - (box.x + 10)) < 24).toBe(true);
    await page.keyboard.press('Escape');
    await expect(content).toBeHidden();
  });

  test('C-174 Hint: hover shows it after the delay, the button keeps its name, focus shows it, Esc hides', async ({
    page,
  }) => {
    await page.goto(PAGE.hint);
    await recordEvents(page);
    const root = demo(page);
    const button = root.getByRole('button');
    const content = part(root, 'content');
    await expect(button).toHaveAccessibleName('Copy command');
    // The hover that loads the machine is the one that shows the hint.
    await button.hover();
    await live(root);
    await expect(content).toBeVisible();
    await expect(button).toHaveAccessibleName('Copy command');
    await expect(button).toHaveAccessibleDescription('copy command');
    await axe(page, 'hint open');
    await page.mouse.move(0, 0);
    await expect(content).toBeHidden();
    expect(await events(page)).toEqual(['ocx:hint:change {"open":true}', 'ocx:hint:change {"open":false}']);

    // Keyboard: the focus that starts the machine shows the hint; Esc hides it.
    await page.reload();
    const again = demo(page);
    await page.keyboard.press('Tab');
    await again.getByRole('button').focus();
    await live(again);
    await expect(part(again, 'content')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(part(again, 'content')).toBeHidden();
  });

  test('C-130e axe clean with every overlay closed', async ({ page }) => {
    for (const path of [...Object.values(PAGE), ...Object.values(STATES)]) {
      await page.goto(path);
      await axe(page, `${path} closed`);
    }
  });

  // A `states` story root: the demo's EventLog adds nodes per event, which is not the component's.
  const stateRoot = (page: Page) => page.locator('.showcase-states [data-zag-root]').first();

  test.describe('C-130h no leak over open/close cycles', () => {
    // Exit transitions (drawer 300 ms, hint fade) end just past Playwright's 270 ms retry step, so
    // each close waited to its 770 ms step: 40+ cycles overran the 30 s timeout. The leak is in JS,
    // not in CSS timing; reduced motion zeroes the durations so a close settles within a frame.
    test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: 'reduce' }));

    test('dialog.zag leaks nothing', async ({ page }) => {
      await page.goto(STATES.dialog);
      const root = stateRoot(page);
      await expectNoLeak(page, async () => {
        await part(root, 'trigger').click();
        await expect(part(root, 'content')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(part(root, 'content')).toBeHidden();
      });
    });

    test('drawer.zag leaks nothing', async ({ page }) => {
      await page.goto(STATES.drawer);
      const root = stateRoot(page);
      await expectNoLeak(page, async () => {
        await part(root, 'trigger').click();
        await expect(part(root, 'content')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(part(root, 'positioner')).toBeHidden();
      });
    });

    test('popover.zag leaks nothing', async ({ page }) => {
      await page.goto(STATES.popover);
      const root = stateRoot(page);
      await expectNoLeak(page, async () => {
        await part(root, 'trigger').click();
        await expect(part(root, 'content')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(part(root, 'content')).toBeHidden();
      });
    });

    test('menu.zag leaks nothing', async ({ page }) => {
      await page.goto(STATES.menu);
      const root = stateRoot(page);
      await expectNoLeak(page, async () => {
        await part(root, 'trigger').click();
        await expect(part(root, 'content')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(part(root, 'content')).toBeHidden();
      });
    });

    test('tooltip.zag leaks nothing', async ({ page }) => {
      await page.goto(STATES.hint);
      const root = page.locator('.showcase-states [data-zag-root]').nth(1); // openDelay=0
      const button = root.getByRole('button');
      await expectNoLeak(page, async () => {
        await button.hover();
        await expect(part(root, 'content')).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(part(root, 'content')).toBeHidden();
      });
    });
  });
});

test('S-102 touch: a tap on the Dialog trigger opens it on that tap and Esc returns focus', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'mobile (touch) project only');
  await page.goto(PAGE.dialog);
  const root = demo(page);
  await part(root, 'trigger').tap();
  await expect(part(root, 'content')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(part(root, 'content')).toBeHidden();
});
