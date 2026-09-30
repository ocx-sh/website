// Motion contract C-302 (D-R7), R5 audit rows: tags (hover/on, chip added, chip removed through
// leave()), CopyButton, CommandBar, CycleButton, Terminal, Meter, ProgressCircle, Loader and the
// DependencyExplorer rows. Per row: the interaction animates the named property, reduced motion makes
// the state final at once, and a fresh load runs no animation in the component (first paint is final).
// CDP slows the document timeline tenfold, so a 150 ms fade is still running when the probe reads it.
import { expect, test, type Locator, type Page } from '@playwright/test';

const story = (slug: string, name = 'default') => `/docs/stories/${slug}/${name}/`;

/** Motion probe (plan 'Motion probe'): properties animating inside `sel` (or on it alone, `self`). */
const animating = (page: Page, sel: string, self = false) =>
  page.evaluate(
    ([s, only]) => {
      const root = document.querySelector(s);
      return document.getAnimations().flatMap((a) => {
        const fx = a.effect as KeyframeEffect | null;
        if (!root || !fx?.target || (only ? fx.target !== root : !root.contains(fx.target))) return [];
        if (a instanceof CSSTransition) return [a.transitionProperty];
        return fx
          .getKeyframes()
          .flatMap((k) => Object.keys(k).filter((p) => !/^(offset|computedOffset|easing|composite)$/.test(p)));
      });
    },
    [sel, self] as const,
  );

const slow = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
};
/** Lets a script-made style change reach the style engine before the probe reads it. */
const frame = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
/** A style change made in the first frames after load may start no transition: wait until painted. */
const painted = async (page: Page) => {
  await page.waitForLoadState('load');
  await frame(page);
  await frame(page);
};
const style = (l: Locator, prop: string) => l.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);
/** A colour token resolved to its computed rgb() on a probe. */
const colour = (page: Page, token: string) =>
  page.evaluate((t) => {
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.color = `var(${t})`;
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, token);

interface Row {
  name: string;
  path: string;
  /** The component root the probe reads. */
  root: string;
  /** Probe only the root itself (a Loader's spinner runs its own infinite animation). */
  self?: boolean;
  props: string[];
  /** Waits for a fresh page to settle before the "still" check (a load that must not animate). */
  ready?: (page: Page) => Promise<void>;
  act: (page: Page) => Promise<void>;
  final: (page: Page) => Promise<void>;
}

/** One audit row: fresh load is still, `act` animates `props`, and under reduced motion `final` holds at once. */
function row({ name, path, root, self = false, props, ready, act, final }: Row) {
  test(`${name}: first paint is still`, async ({ page }) => {
    await page.goto(path);
    await ready?.(page);
    expect(await animating(page, root, self)).toEqual([]);
  });
  test(`${name}: ${props.join(' + ')} animate`, async ({ page }) => {
    await page.goto(path);
    await ready?.(page);
    await painted(page);
    await slow(page);
    await act(page);
    expect(await animating(page, root, self)).toEqual(expect.arrayContaining(props));
  });
  test(`${name}: reduced motion lands at once`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await ready?.(page);
    await act(page);
    await final(page);
    expect(await animating(page, root, self)).toEqual([]);
  });
}

test.skip(({ isMobile }) => isMobile, 'hover and pointer states, clipboard and CDP: desktop project only');
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

// TagGroup filter chips: pressing one fades its colours to "on".
const FILTERS = '#story [data-zag-root="tag-group"]';
const chip = (page: Page) => page.locator(`${FILTERS} .ocx-ui-tag[aria-pressed="false"]`).first();
row({
  name: 'Tag filter chip on',
  path: story('tag-group'),
  root: FILTERS,
  props: ['color', 'background-color', 'border-top-color'],
  act: async (page) => {
    const c = chip(page);
    await c.evaluate((e) => e.setAttribute('data-probe', ''));
    await c.click();
    await expect(page.locator('[data-probe]')).toHaveAttribute('aria-pressed', 'true');
  },
  final: async (page) => {
    expect(await style(page.locator('[data-probe]'), 'border-color')).toBe(await colour(page, '--ocx-color-accent'));
  },
});

// TagsInput: a chip added after start fades and scales in; a removed chip leaves through leave().
const TAGS = '#story [data-zag-root="tags-input"]';
const tagsField = (page: Page) => page.getByRole('combobox', { name: 'Topics', exact: true });
const liveChips = (page: Page) =>
  page.locator(`${TAGS} [data-scope="tags-input"][data-part="item"]:not([data-leaving])`);
const startTags = async (page: Page) => {
  await tagsField(page).focus();
  await expect(page.locator(TAGS)).toHaveAttribute('data-zag-state', 'live');
};
row({
  name: 'TagsInput chip added',
  path: story('tags-input'),
  root: TAGS,
  props: ['opacity', 'scale'],
  act: async (page) => {
    await startTags(page);
    await page.keyboard.type('kub');
    await page.keyboard.press('Enter');
    await expect(liveChips(page)).toHaveCount(3);
  },
  final: async (page) => {
    expect(await style(liveChips(page).last(), 'opacity')).toBe('1');
  },
});
row({
  name: 'TagsInput chip removed',
  path: story('tags-input'),
  root: TAGS,
  props: ['opacity', 'scale'],
  act: async (page) => {
    await startTags(page);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(liveChips(page)).toHaveCount(1);
  },
  final: async (page) => {
    await expect(page.locator(`${TAGS} [data-leaving]`)).toHaveCount(0);
  },
});

test('TagsInput: a removed chip is gone from the DOM after its exit, and Zag value excludes it', async ({ page }) => {
  await page.goto(story('tags-input'));
  await slow(page);
  await startTags(page);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  const leaving = page.locator(`${TAGS} [data-scope="tags-input"][data-part="item"][data-leaving]`);
  await expect(leaving).toHaveCount(1);
  await expect(leaving).toHaveAttribute('inert', '');
  await expect(liveChips(page).locator('[data-part="item-text"]')).toHaveText(['cli']);
  await expect(page.locator('#story .showcase-log__items > li').first()).toHaveText(
    'ocx:tags-input:change {"value":["cli"]}',
  );
  await expect(leaving).toHaveCount(0);
  await expect(page.locator(`${TAGS} [data-scope="tags-input"][data-part="item"]`)).toHaveCount(1);
  // The pool reuses the node: adding again brings a live chip, and the value stays in step.
  await page.keyboard.type('rust');
  await page.keyboard.press('Enter');
  await expect(liveChips(page).locator('[data-part="item-text"]')).toHaveText(['cli', 'rust']);
  await expect(page.locator('#story .showcase-log__items > li').first()).toHaveText(
    'ocx:tags-input:change {"value":["cli","rust"]}',
  );
  // Zag maps a chip to its value by its index among the live chips: removing `cli` while it still
  // fades out, then `rust`, must delete `rust` (index 0 of the live ones), not miss by one.
  const removeChip = (name: string) =>
    page
      .locator(TAGS)
      .getByRole('button', { name: `Remove ${name}`, exact: true })
      .click();
  await removeChip('cli');
  await expect(leaving).toHaveCount(1);
  await removeChip('rust');
  await expect(page.locator('#story .showcase-log__items > li').first()).toHaveText(
    'ocx:tags-input:change {"value":[]}',
  );
  await expect(liveChips(page)).toHaveCount(0);
  await expect(page.locator(`${TAGS} [data-scope="tags-input"][data-part="item"]`)).toHaveCount(0);
});

// TagGroup removable labels: the <li> leaves through leave().
const REMOVABLE = '#story ul[data-ocx-tag-group]';
row({
  name: 'TagGroup chip removed',
  path: story('tag-group', 'demo'),
  root: REMOVABLE,
  props: ['opacity', 'scale'],
  act: async (page) => {
    await page.locator(REMOVABLE).getByRole('button', { name: 'Remove stable', exact: true }).click();
  },
  final: async (page) => {
    await expect(page.locator(`${REMOVABLE} [data-value="stable"]`)).toHaveCount(0);
  },
});

// CopyButton: the labels crossfade in one cell and the success colour fades in.
const COPY = '#story [data-zag-root="clipboard"]';
row({
  name: 'CopyButton copied',
  path: story('copy-button'),
  root: COPY,
  props: ['opacity', 'color', 'border-top-color'],
  act: async (page) => {
    await page.locator(`${COPY} [data-part="trigger"]`).click();
    await expect(page.locator(`${COPY} [data-part="trigger"]`)).toHaveAttribute('data-copied', '');
  },
  final: async (page) => {
    const [idle, done] = await page.locator(`${COPY} [data-part="indicator"]`).all();
    expect(await style(idle!, 'opacity')).toBe('0');
    expect(await style(done!, 'opacity')).toBe('1');
  },
});

test('CopyButton reserves the "copied" width: the button does not change size on copy', async ({ page }) => {
  await page.goto(story('copy-button'));
  const trigger = page.locator(`${COPY} [data-part="trigger"]`);
  const before = await trigger.boundingBox();
  await trigger.click();
  await expect(trigger).toHaveAttribute('data-copied', '');
  expect((await trigger.boundingBox())?.width).toBe(before?.width);
});

// CommandBar: the field's border and the icon lane's colour fade on hover.
const CMDBAR = '#story .ocx-cmdbar';
row({
  name: 'CommandBar field hover',
  path: story('command-bar'),
  root: CMDBAR,
  props: ['border-top-color', 'color'],
  act: async (page) => {
    await page.locator(`${CMDBAR} .ocx-cmdbar__field`).hover();
  },
  final: async (page) => {
    const field = page.locator(`${CMDBAR} .ocx-cmdbar__field`);
    expect(await style(field, 'border-color')).toBe(await colour(page, '--ocx-color-hover-border'));
  },
});

// CycleButton: the glyphs crossfade with a turn, only once the first click set data-live.
const CYCLE = '#story .ocx-ui-cycle-button';
row({
  name: 'CycleButton glyph swap',
  path: story('cycle-button'),
  root: CYCLE,
  props: ['opacity', 'rotate', 'scale'],
  act: async (page) => {
    await page.locator(CYCLE).first().click();
    await expect(page.locator(CYCLE).first()).toHaveAttribute('data-value', 'dark');
  },
  final: async (page) => {
    const current = page.locator(`${CYCLE} .ocx-ui-cycle-button__current`).first();
    expect(await style(current, 'opacity')).toBe('1');
  },
});

test('CycleButton: every glyph is laid out at first paint and no button is live before a click', async ({ page }) => {
  await page.goto(story('cycle-button'));
  await expect(page.locator(`${CYCLE}[data-live]`)).toHaveCount(0);
  for (const g of await page.locator(`${CYCLE} .ocx-ui-cycle-button__state`).all())
    expect(await style(g, 'display')).not.toBe('none');
});

// Terminal (open): the start overlay fades out; the play/pause glyphs crossfade once live.
const TERMINAL = '#story .ocx-terminal';
const startPlayer = async (page: Page) => {
  await page.locator(`${TERMINAL} .ocx-terminal__start-button`).click();
  await expect(page.locator(TERMINAL)).toHaveAttribute('data-live', '');
  await expect(page.locator(`${TERMINAL} .ocx-terminal__controls`)).toHaveAttribute('data-state', 'playing');
};
row({
  name: 'Terminal start overlay',
  path: story('terminal', 'open'),
  root: `${TERMINAL} .ocx-terminal__start`,
  self: true,
  props: ['opacity', 'display'],
  act: async (page) => {
    await page.locator(`${TERMINAL} .ocx-terminal__start-button`).click();
  },
  final: async (page) => {
    expect(await style(page.locator(`${TERMINAL} .ocx-terminal__start`), 'display')).toBe('none');
  },
});
row({
  name: 'Terminal play/pause glyph',
  path: story('terminal', 'open'),
  root: `${TERMINAL} .ocx-terminal__play`,
  props: ['opacity', 'scale'],
  act: async (page) => {
    await startPlayer(page);
    await page.locator(`${TERMINAL} .ocx-terminal__play`).click();
    await expect(page.locator(`${TERMINAL} .ocx-terminal__controls`)).not.toHaveAttribute('data-state', 'playing');
  },
  final: async (page) => {
    expect(await style(page.locator(`${TERMINAL} .ocx-terminal__play-icon`), 'opacity')).toBe('1');
    expect(await style(page.locator(`${TERMINAL} .ocx-terminal__pause-icon`), 'opacity')).toBe('0');
  },
});
row({
  name: 'Terminal start button hover',
  path: story('terminal', 'open'),
  root: `${TERMINAL} .ocx-terminal__start-button`,
  props: ['color'],
  act: async (page) => {
    await page.locator(`${TERMINAL} .ocx-terminal__start-button`).hover();
  },
  final: async () => {},
});

/** A consumer's value change: `--_value` on the root, which glides there (the fill follows).
 * Chrome starts no transition on an element's next change when its style was resolved while the
 * page's preloaded fonts were still arriving (any property, inline or class; a fresh restyle clears it,
 * a later font does not cause it), so whether the first change glides is a font-timing race. Settle
 * first: fonts in, then one inert restyle of the root, so the row measures the CSS, not that race. */
const setValue = async (root: Locator, value: string) => {
  await root.page().evaluate(() => document.fonts.ready);
  await root.evaluate((e) => (e as HTMLElement).style.setProperty('--_settled', '1'));
  await frame(root.page());
  await root.evaluate((e, v) => (e as HTMLElement).style.setProperty('--_value', v), value);
  await frame(root.page());
};

// Meter: a new value glides (the registered --_value), and the fill's scale follows from inline-start.
const METER = '#story .ocx-ui-meter';
row({
  name: 'Meter value change',
  path: story('meter'),
  root: METER,
  props: ['--_value'],
  act: async (page) => {
    await setValue(page.locator(METER), '20');
  },
  final: async (page) => {
    expect(await style(page.locator(`${METER} .ocx-ui-meter__fill`), 'scale')).toBe('0.2 1');
  },
});

test('Meter: the fill spans the value from inline-start, as the percent width did', async ({ page }) => {
  await page.goto(story('meter'));
  const track = await page.locator(`${METER} .ocx-ui-meter__track`).boundingBox();
  const fill = await page.locator(`${METER} .ocx-ui-meter__fill`).boundingBox();
  expect(fill!.x).toBeCloseTo(track!.x, 0);
  expect(fill!.width).toBeCloseTo(track!.width * 0.62, 0);
});

// ProgressCircle: a new value glides, and the arc follows.
const RING = '#story .ocx-ui-progress-circle';
row({
  name: 'ProgressCircle value change',
  path: story('progress-circle'),
  root: RING,
  props: ['--_value'],
  act: async (page) => {
    await setValue(page.locator(RING), '80');
  },
  final: async (page) => {
    expect(await style(page.locator(`${RING} [data-part="fill"]`), 'stroke-dasharray')).toMatch(
      /\b80(px)?\)?,? 100(px)?$/,
    );
  },
});

// Loader: done, it fades out (exit only); the spinner's own loop is not this row's.
const LOADER = '#story .ocx-ui-loader';
row({
  name: 'Loader hidden when done',
  path: story('loader'),
  root: LOADER,
  self: true,
  props: ['opacity', 'display'],
  act: async (page) => {
    await page.locator(LOADER).evaluate((e) => ((e as HTMLElement).hidden = true));
    await frame(page);
  },
  final: async (page) => {
    await expect(page.locator(LOADER)).toBeHidden();
  },
});

// DependencyExplorer: rows a filter shows fade in; the load that replaces the placeholders does not.
const DEPS = '#story .ocx-deps';
const TABLE = `${DEPS} .ocx-deps__table`;
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search dependencies' });
row({
  name: 'DependencyExplorer rows shown',
  path: story('dependency-explorer'),
  root: TABLE,
  props: ['opacity'],
  ready: async (page) => {
    await expect(page.locator(TABLE)).not.toHaveAttribute('aria-busy');
  },
  act: async (page) => {
    await search(page).fill('darling');
    await search(page).fill('');
  },
  final: async (page) => {
    for (const tr of await page.locator(`${TABLE} tbody tr:not([hidden])`).all())
      expect(await style(tr, 'opacity')).toBe('1');
  },
});
