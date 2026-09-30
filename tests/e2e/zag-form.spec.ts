// Z5 form controls on Zag (C-130 a–h, C-160…C-162, S-110) on their story pages (C-125):
// Choice (checkbox.zag, switch.zag), RadioGroup (radio-group.zag), Select (select.zag),
// Combobox (combobox.zag). SSR markup equality (C-130a) and the page shape (C-130i) are unit
// tests (ui-form.test.ts, ui-overlay.test.ts, showcase-shape.test.ts); the fixture build is C-124.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoLeak } from './helpers/leak.ts';

// Behaviour is viewport-independent and CDP (leak) is chromium-only: one desktop pass.
test.skip(({ isMobile }) => isMobile, 'desktop (chromium) project only');

const STORY = '/docs/stories/';
// The default story of each component (the demo, with its EventLog); `STATES` are the states stories.
const PAGE = {
  choice: `${STORY}choice/default/`,
  radio: `${STORY}radio-group/default/`,
  select: `${STORY}select/default/`,
  combobox: `${STORY}combobox/default/`,
};
const STATES = {
  'choice states': `${STORY}choice/states/`,
  'radio states': `${STORY}radio-group/states/`,
  'select states': `${STORY}select/states/`,
  'combobox states': `${STORY}combobox/states/`,
};
const ALL = { ...PAGE, ...STATES };
const ZAG_CHUNK = /\/_astro\/[^/]*\.zag\.[^/]*\.js$/;

const live = (root: Locator) => expect(root).toHaveAttribute('data-zag-state', 'live');
/** Hover a root and wait until its machine runs. */
async function start(root: Locator) {
  await root.hover();
  await live(root);
}
/** The newest event line of the page's EventLog. */
const lastEvent = (page: Page) => page.locator('.showcase-log__items > li').first();
/** The EventLog grows by design; leak cycles measure the component, so it goes first. */
const dropLogs = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.showcase-log').forEach((l) => l.remove()));
/** Wait out running CSS transitions (popup fade, fill change): mid-fade colours are neither state. */
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
async function axe(page: Page) {
  // axe blends colours through the popup's opacity, so a fading popup fails contrast it passes at rest.
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).include('main').analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
/** Form data of the fields inside `root`, read through a <form> wrapped around it. */
const formData = (root: Locator) =>
  root.evaluate((el) => {
    const form = document.createElement('form');
    el.before(form);
    form.append(el);
    const data = [...new FormData(form)].map(([k, v]) => `${k}=${typeof v === 'string' ? v : v.name}`);
    form.before(el);
    form.remove();
    return data;
  });

const demo = (page: Page) => page.locator('#story');
const checkbox = (page: Page) => demo(page).locator('[data-zag-root="checkbox"]');
const zswitch = (page: Page) => demo(page).locator('[data-zag-root="switch"]');
const radios = (page: Page) => demo(page).locator('[data-zag-root="radio-group"]');
const select = (page: Page) => demo(page).locator('[data-zag-root="select"]');
const combobox = (page: Page) => demo(page).locator('[data-zag-root="combobox"]');

test.describe('C-130b SSR roots', () => {
  test.use({ javaScriptEnabled: false });
  for (const [name, path] of Object.entries(ALL))
    test(`C-130b ${name}: every root is idle with data-zag-props, no data-focus before any script`, async ({
      page,
    }) => {
      await page.goto(path);
      const roots = page.locator('[data-zag-root]');
      expect(await roots.count()).toBeGreaterThan(0);
      for (const root of await roots.all()) {
        await expect(root).toHaveAttribute('data-zag-state', 'idle');
        expect(JSON.parse((await root.getAttribute('data-zag-props')) ?? 'x')).toBeInstanceOf(Object);
      }
      expect(await page.locator('[data-zag-root] [data-focus], [data-zag-root] [data-focus-visible]').count()).toBe(0);
    });
});

test.describe('C-130c first paint is final', () => {
  for (const [name, path] of Object.entries(PAGE))
    test(`C-130c ${name}: the demo looks the same before its machines load and once they run`, async ({ page }) => {
      await page.route(ZAG_CHUNK, (route) => route.abort());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
      await page.mouse.move(0, 0);
      const stage = demo(page).locator('.showcase-demo__stage');
      const before = await stage.screenshot();
      await page.unroute(ZAG_CHUNK);
      const roots = stage.locator('[data-zag-root]');
      for (const root of await roots.all()) await start(root);
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      expect(await stage.screenshot()).toEqual(before);
    });
});

test.describe('C-160 Choice (checkbox.zag, switch.zag)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE.choice);
  });

  test('C-130d C-160 checkbox: Space toggles the focused checkbox; the change is an ocx:checkbox:change event', async ({
    page,
  }) => {
    const input = page.getByRole('checkbox', { name: 'include yanked' });
    await input.focus();
    await live(checkbox(page));
    await expect(input).toBeChecked();
    await page.keyboard.press('Space');
    await expect(input).not.toBeChecked();
    await expect(checkbox(page).locator('[data-part="control"]')).toHaveAttribute('data-state', 'unchecked');
    await expect(lastEvent(page)).toHaveText('ocx:checkbox:change {"checked":false}');
  });

  test('C-130d C-160 switch: role switch, Space toggles, ocx:switch:change reports it', async ({ page }) => {
    const input = page.getByRole('switch', { name: 'clean env' });
    await input.focus();
    await live(zswitch(page));
    await page.keyboard.press('Space');
    await expect(input).toBeChecked();
    await expect(lastEvent(page)).toHaveText('ocx:switch:change {"checked":true}');
  });

  test('C-160 the box draws the input state: focus ring on keyboard focus, fill follows :checked', async ({ page }) => {
    const input = page.getByRole('checkbox', { name: 'include yanked' });
    const box = checkbox(page).locator('.ocx-ui-choice__box');
    const style = (prop: 'backgroundColor' | 'outlineStyle') => box.evaluate((el, p) => getComputedStyle(el)[p], prop);
    const checkedFill = await style('backgroundColor');
    await input.focus(); // programmatic focus with no pointer input matches :focus-visible in Chromium
    expect(await style('outlineStyle')).not.toBe('none');
    await page.keyboard.press('Space');
    await expect(input).not.toBeChecked();
    await settle(page); // the fill transitions (--ocx-duration-base); read its end state
    expect(await style('backgroundColor')).not.toBe(checkedFill);
  });

  test('C-160 the native input submits in a form before and after the machine starts', async ({ page }) => {
    const root = checkbox(page);
    expect(await formData(root)).toEqual(['yanked=on']);
    await start(root);
    await root.click();
    expect(await formData(root)).toEqual([]);
    await root.click();
    expect(await formData(root)).toEqual(['yanked=on']);
  });

  test('C-130h checkbox.zag: toggling leaks no listeners, nodes or heap', async ({ page }) => {
    const root = checkbox(page);
    await start(root);
    await dropLogs(page);
    await expectNoLeak(page, async () => {
      await root.click();
      await root.click();
    });
  });

  test('C-130h switch.zag: toggling leaks no listeners, nodes or heap', async ({ page }) => {
    const root = zswitch(page);
    await start(root);
    await dropLogs(page);
    await expectNoLeak(page, async () => {
      await root.click();
      await root.click();
    });
  });
});

test.describe('S-110 early form input', () => {
  test('S-110 a checkbox clicked before its machine loads keeps its state after start; the form submits it either way', async ({
    page,
  }) => {
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(ZAG_CHUNK, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(PAGE.choice);
    const root = checkbox(page);
    await root.click(); // starts loading; the native input toggles now
    await expect(root).toHaveAttribute('data-zag-state', 'loading');
    await expect(page.getByRole('checkbox', { name: 'include yanked' })).not.toBeChecked();
    expect(await formData(root)).toEqual([]);
    release();
    await live(root);
    await expect(page.getByRole('checkbox', { name: 'include yanked' })).not.toBeChecked();
    await expect(root.locator('[data-part="control"]')).toHaveAttribute('data-state', 'unchecked');
    expect(await formData(root)).toEqual([]);
  });
});

test.describe('C-160 RadioGroup (radio-group.zag)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE.radio);
  });

  test('C-130d C-160 Tab lands on the checked radio; arrows check the next and skip disabled ones; ocx:radio-group:change', async ({
    page,
  }) => {
    const group = page.getByRole('radiogroup', { name: 'Install scope' });
    await group.getByRole('radio', { name: 'project' }).focus();
    await live(radios(page));
    await page.keyboard.press('ArrowDown');
    await expect(group.getByRole('radio', { name: 'user' })).toBeChecked();
    await expect(group.getByRole('radio', { name: 'user' })).toBeFocused();
    await expect(lastEvent(page)).toHaveText('ocx:radio-group:change {"value":"user"}');
    await page.keyboard.press('ArrowDown'); // system is disabled: wraps to project
    await expect(group.getByRole('radio', { name: 'project' })).toBeChecked();
    expect(await formData(radios(page))).toEqual(['scope=project']);
  });

  test('C-130h radio-group.zag: switching the checked radio leaks nothing', async ({ page }) => {
    const root = radios(page);
    await start(root);
    await dropLogs(page);
    await expectNoLeak(page, async () => {
      await root.getByText('user').click();
      await root.getByText('project').click();
    });
  });
});

test.describe('C-161 Select (select.zag)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE.select);
  });
  const trigger = (page: Page) => select(page).getByRole('combobox', { name: 'Platform', exact: true });
  const listbox = (page: Page) => page.getByRole('listbox', { name: 'Platform', exact: true });

  test('C-130d C-161 keyboard: Enter opens on the chosen option, arrows move, Enter chooses and closes, focus returns', async ({
    page,
  }) => {
    await trigger(page).focus(); // the focus that starts the machine reaches it (mount hand-over)
    await live(select(page));
    await page.keyboard.press('Enter');
    await expect(listbox(page)).toBeVisible();
    await expect(listbox(page).getByRole('option', { name: 'linux/amd64' })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(listbox(page)).toBeHidden();
    await expect(trigger(page)).toHaveText('linux/arm64');
    await expect(trigger(page)).toBeFocused();
    await expect(lastEvent(page)).toHaveText('ocx:select:change {"value":"linux/arm64"}');
    expect(await select(page).locator('select').inputValue()).toBe('linux/arm64');
  });

  test('C-130d C-161 Escape closes without a change; End/Home jump; disabled options are skipped', async ({ page }) => {
    await trigger(page).focus();
    await live(select(page));
    await page.keyboard.press('ArrowDown');
    await expect(listbox(page)).toBeVisible();
    await expect(listbox(page)).toBeFocused(); // Zag moves focus to the list a frame after opening
    await page.keyboard.press('End');
    await expect(listbox(page).getByRole('option', { name: 'windows/amd64' })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Home');
    await expect(listbox(page).getByRole('option', { name: 'linux/amd64' })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toBeHidden();
    await expect(trigger(page)).toHaveText('linux/amd64');
  });

  test('C-161 typeahead on the closed trigger chooses the next option starting with the typed letters', async ({
    page,
  }) => {
    await trigger(page).focus();
    await live(select(page));
    await page.keyboard.type('d');
    await expect(trigger(page)).toHaveText('darwin/arm64');
  });

  test('C-161 a click before the machine loads is replayed: the list opens', async ({ page }) => {
    await trigger(page).click();
    await expect(listbox(page)).toBeVisible();
  });

  test('C-161 the popup is Zag-positioned under the trigger (D-Z10) and wears the overlay surface', async ({
    page,
  }) => {
    await trigger(page).evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await trigger(page).click();
    await expect(listbox(page)).toBeVisible();
    const t = (await trigger(page).boundingBox())!;
    const l = (await listbox(page).boundingBox())!;
    expect(l.y).toBeGreaterThanOrEqual(t.y + t.height);
    expect(l.y - (t.y + t.height)).toBeLessThanOrEqual(16);
    expect(Math.abs(l.x - t.x)).toBeLessThanOrEqual(1);
    expect(l.width).toBeGreaterThanOrEqual(t.width - 1);
    expect(await listbox(page).evaluate((e) => e.matches('.ocx-ui-overlay'))).toBe(true);
  });

  test('C-161 options appended to the native select join the open list; the trigger box does not move', async ({
    page,
  }) => {
    const before = await trigger(page).boundingBox();
    await start(select(page));
    await select(page)
      .locator('select')
      .evaluate((s: HTMLSelectElement) => {
        const o = new Option('solaris/sparc', 'solaris/sparc');
        o.dataset['meta'] = '1';
        s.append(o);
      });
    await trigger(page).click();
    const added = listbox(page).getByRole('option', { name: 'solaris/sparc' });
    await expect(added).toBeVisible();
    await expect(added.locator('.ocx-ui-option__meta')).toHaveText('1');
    await added.click();
    await expect(trigger(page)).toHaveText('solaris/sparc');
    expect(await trigger(page).boundingBox()).toEqual(before);
  });

  test('C-161 only a disabled select greys its label, not one holding a disabled option', async ({ page }) => {
    const label = (text: string) =>
      page
        .locator('.ocx-ui-select > .ocx-ui-field__label')
        .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
    const color = (text: string) => label(text).evaluate((e) => getComputedStyle(e).color);
    const demo = await color('Platform'); // the default story's list has a disabled option
    await page.goto(STATES['select states']);
    const [meta, disabled] = [await color('License'), await color('Platform (disabled)')]; // License has none
    expect(demo).toBe(meta);
    expect(disabled).not.toBe(demo);
  });

  test('C-130h select.zag: opening and closing leaks nothing', async ({ page }) => {
    await start(select(page));
    await dropLogs(page);
    const cycle = async () => {
      await trigger(page).click();
      await expect(listbox(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(listbox(page)).toBeHidden();
    };
    // JIT warm-up: the first cycles compile the positioning path (~0.5 MB once, flat after).
    for (let i = 0; i < 10; i++) await cycle();
    await expectNoLeak(page, cycle);
  });
});

test.describe('C-162 Combobox (combobox.zag)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE.combobox);
  });
  const input = (page: Page) => combobox(page).getByRole('combobox', { name: 'Package', exact: true });
  const listbox = (page: Page) => page.getByRole('listbox', { name: 'Package', exact: true });
  const shown = (page: Page) => listbox(page).locator('[role="option"]:visible');

  test('C-130d C-162 typing filters and marks the match; ArrowDown + Enter commits; events input and change', async ({
    page,
  }) => {
    await input(page).focus();
    await live(combobox(page));
    await input(page).fill('');
    await page.keyboard.type('mark');
    await expect(listbox(page)).toBeVisible();
    await expect(shown(page)).toHaveCount(1);
    await expect(shown(page).locator('mark')).toHaveText('mark');
    // Design c-combobox: the runtime <mark> is bold + coral underline, never the UA's yellow fill.
    await expect(shown(page).locator('mark')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(demo(page).locator('.showcase-log__items')).toContainText('ocx:combobox:input {"query":"mark"}');
    await page.keyboard.press('ArrowDown');
    await expect(shown(page).first()).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(listbox(page)).toBeHidden();
    await expect(input(page)).toHaveValue('cmark-cli');
    await expect(demo(page).locator('.showcase-log__items')).toContainText('ocx:combobox:change {"value":"cmark-cli"}');
  });

  test('C-130d C-162 no match shows the empty text; Escape closes, a second Escape restores the committed label', async ({
    page,
  }) => {
    await input(page).focus();
    await live(combobox(page));
    await input(page).fill('');
    await page.keyboard.type('zzz');
    await expect(combobox(page).locator('.ocx-ui-combobox__empty')).toBeVisible();
    await expect(shown(page)).toHaveCount(0);
    await page.keyboard.press('Escape'); // APG: the first Escape closes the list
    await expect(listbox(page)).toBeHidden();
    await expect(input(page)).toHaveValue('zzz');
    await page.keyboard.press('Escape'); // the second restores the committed option
    await expect(input(page)).toHaveValue('kitware/cmake');
    await expect(combobox(page).locator('.ocx-ui-combobox__empty')).toBeHidden();
  });

  test('C-162 the typed state opens filtered to its query', async ({ page }) => {
    await page.goto(STATES['combobox states']);
    const root = page.locator('[data-zag-root="combobox"]').filter({ has: page.getByLabel('Package, no match') });
    await root.getByRole('combobox').focus();
    await live(root);
    await page.keyboard.press('ArrowDown');
    await expect(root.locator('.ocx-ui-combobox__empty')).toBeVisible();
    await expect(root.locator('.ocx-ui-combobox__empty')).toHaveText('no package matches');
  });

  test('C-274 the control is an InputGroup; the clear button is a ghost icon button named "Clear <label>"', async ({
    page,
  }) => {
    const group = combobox(page).locator('.ocx-ui-input-group');
    await expect(group).toHaveAttribute('data-part', 'control');
    await expect(group.locator('> svg.ocx-icon')).toHaveCount(1);
    const clear = group.locator('[data-part="clear-trigger"]');
    await expect(clear).toHaveAttribute('aria-label', 'Clear Package');
    await expect(clear).toHaveAttribute('data-variant', 'ghost');
    await expect(clear.locator('svg')).toHaveCount(1);
    await expect(clear).toHaveText('');
  });

  test('C-274 label styles come from Combobox itself: this page renders no Input, yet the label is styled', async ({
    page,
  }) => {
    await expect(page.locator('.ocx-ui-input:not(.ocx-ui-input-group__input)')).toHaveCount(0);
    const label = combobox(page).locator('> .ocx-ui-field__label').first();
    // field.css sets the label to --ocx-text-sm; without it the label would inherit the body size.
    const [size, token] = await label.evaluate((e) => {
      const probe = document.createElement('i');
      probe.style.fontSize = 'var(--ocx-text-sm)';
      e.after(probe);
      const token = getComputedStyle(probe).fontSize;
      probe.remove();
      return [getComputedStyle(e).fontSize, token];
    });
    expect(size).toBe(token);
  });

  test('C-162 a disabled combobox greys its label (data-disabled), an enabled one keeps fg', async ({ page }) => {
    const label = (name: string) =>
      page
        .locator('.ocx-ui-combobox > .ocx-ui-field__label', { hasText: name })
        .first()
        .evaluate((e) => getComputedStyle(e).color);
    const enabled = await label('Package');
    await page.goto(STATES['combobox states']);
    expect(await label('Package (disabled)')).not.toBe(enabled);
  });

  test('C-130h combobox.zag: filtering, opening and closing leaks nothing', async ({ page }) => {
    await input(page).focus();
    await live(combobox(page));
    await dropLogs(page);
    await expectNoLeak(page, async () => {
      await input(page).fill(''); // Esc keeps the query: a refill with the same text is no input change
      await input(page).fill('c');
      await expect(listbox(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(listbox(page)).toBeHidden();
    });
  });
});

test.describe('C-130e axe', () => {
  for (const [name, path] of Object.entries(ALL))
    test(`C-130e ${name}: axe clean on the page with every machine running`, async ({ page }) => {
      await page.goto(path);
      for (const root of await page.locator('main [data-zag-root]').all()) await start(root);
      await axe(page);
    });

  test('C-130e select and combobox: axe clean with the popup open', async ({ page }) => {
    await page.goto(PAGE.select);
    await select(page).getByRole('combobox').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await axe(page);
    await page.goto(PAGE.combobox);
    await combobox(page).getByRole('combobox').focus();
    await live(combobox(page));
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox', { name: 'Package', exact: true })).toBeVisible();
    await axe(page);
  });
});
