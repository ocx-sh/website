// Motion contract C-302 (D-R7), R4 audit rows: overlay chevrons and highlights, Button, ToggleButton,
// field borders, SearchField clear, Breadcrumbs. Per row: the interaction animates the named property,
// reduced motion makes the state final at once, and a fresh load runs no animation in the component.
// CDP slows the document timeline tenfold, so a 100 ms fade is still running when the probe reads it.
import { expect, test, type Locator, type Page } from '@playwright/test';

const story = (slug: string, name = 'default') => `/docs/stories/${slug}/${name}/`;

/** Motion probe (plan 'Motion probe'): properties animating inside `sel`, from document.getAnimations(). */
const animating = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const root = document.querySelector(s);
    return document.getAnimations().flatMap((a) => {
      const fx = a.effect as KeyframeEffect | null;
      if (!root || !(fx?.target && root.contains(fx.target))) return [];
      if (a instanceof CSSTransition)
        return [a.transitionProperty.replace(/^border-(top|right|bottom|left)-/, 'border-')];
      return fx
        .getKeyframes()
        .flatMap((k) => Object.keys(k).filter((p) => !/^(offset|computedOffset|easing|composite)$/.test(p)));
    });
  }, sel);

const slow = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 });
};
/** Headless Chromium starts no transition on an element's first hover after load: hover, leave, hover again. */
const hover = async (page: Page, l: Locator) => {
  await l.hover();
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await l.hover();
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

/** One audit row: fresh load is still, `act` animates `props`, and under reduced motion `final` holds at once. */
function row(
  name: string,
  path: string,
  root: string,
  props: string[],
  act: (page: Page) => Promise<void>,
  final: (page: Page) => Promise<void>,
) {
  test(`${name}: first paint is still`, async ({ page }) => {
    await page.goto(path);
    expect(await animating(page, root)).toEqual([]);
  });
  test(`${name}: ${props.join(' + ')} animate`, async ({ page }) => {
    await page.goto(path);
    await slow(page);
    await act(page);
    expect(await animating(page, root)).toEqual(expect.arrayContaining(props));
  });
  test(`${name}: reduced motion lands at once`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await act(page);
    await final(page);
    expect(await animating(page, root)).toEqual([]);
  });
}

test.skip(({ isMobile }) => isMobile, 'hover and pointer states: desktop project only');

// Select: the chevron turns on open (live machine only), option rows fade their highlight.
const SELECT = '#story [data-zag-root="select"]';
const openSelect = async (page: Page) => {
  const trigger = page.locator(`${SELECT} .ocx-ui-select__control`);
  await trigger.focus(); // starts the machine; the rotate rule waits for it (live)
  await expect(page.locator(SELECT)).toHaveAttribute('data-zag-state', 'live');
  await trigger.click();
  await expect(page.locator(`${SELECT} .ocx-ui-select__icon`)).toHaveAttribute('data-state', 'open');
};
row('Select chevron', story('select'), SELECT, ['rotate'], openSelect, async (page) => {
  expect(await style(page.locator(`${SELECT} .ocx-ui-select__icon`), 'rotate')).toBe('180deg');
});
row(
  'Select option row',
  story('select'),
  SELECT,
  ['background-color'],
  async (page) => {
    await openSelect(page);
    await page.getByRole('option', { name: 'darwin/arm64' }).hover();
  },
  async (page) => {
    const option = page.getByRole('option', { name: 'darwin/arm64' });
    expect(await style(option, 'background-color')).not.toBe('rgba(0, 0, 0, 0)');
  },
);

// Menu (Popover API): chevron on open, item highlight.
const MENU = '#story .ocx-ui-menu';
row(
  'Menu chevron',
  story('menu'),
  MENU,
  ['rotate'],
  async (page) => {
    await page.locator(`${MENU} .ocx-ui-menu__trigger`).click();
  },
  async (page) => {
    expect(await style(page.locator(`${MENU} .ocx-ui-menu__chevron`), 'rotate')).toBe('180deg');
  },
);
row(
  'Menu item',
  story('menu'),
  MENU,
  ['background-color'],
  async (page) => {
    await page.locator(`${MENU} .ocx-ui-menu__trigger`).click();
    await page.locator(`${MENU} .ocx-ui-menu__item`, { hasText: 'Docs' }).hover();
  },
  async (page) => {
    const item = page.locator(`${MENU} .ocx-ui-menu__item`, { hasText: 'Docs' });
    expect(await style(item, 'background-color')).not.toBe('rgba(0, 0, 0, 0)');
  },
);

// ActionMenu (Zag menu): item highlight.
const ACTIONS = '#story .ocx-ui-action-menu';
row(
  'ActionMenu item',
  story('action-menu'),
  ACTIONS,
  ['background-color'],
  async (page) => {
    await page.locator(`${ACTIONS} [data-part="trigger"]`).click();
    await expect(page.locator(`${ACTIONS} [data-part="content"]`)).toBeVisible();
    await page.locator(`${ACTIONS} [data-part="item"][data-value="pin"]`).hover();
  },
  async (page) => {
    const item = page.locator(`${ACTIONS} [data-part="item"][data-value="pin"]`);
    await expect(item).toHaveAttribute('data-highlighted', '');
    expect(await style(item, 'background-color')).not.toBe('rgba(0, 0, 0, 0)');
  },
);

// Button and ToggleButton: hover and pressed ink.
const BUTTON = '#story';
row(
  'Button hover',
  story('button'),
  BUTTON,
  ['border-color'],
  async (page) => {
    await hover(page, page.locator(`${BUTTON} .ocx-ui-button[data-variant="secondary"]`).first());
  },
  async (page) => {
    const install = page.locator(`${BUTTON} .ocx-ui-button[data-variant="secondary"]`).first();
    expect(await style(install, 'border-top-color')).toBe(await colour(page, '--ocx-color-hover-border'));
  },
);
const TOGGLE = '#story .ocx-ui-toggle-button[data-value="hidden"]';
row(
  'ToggleButton pressed',
  story('toggle-button'),
  '#story',
  ['color', 'background-color', 'border-color'],
  async (page) => {
    await page.locator(TOGGLE).click();
    await expect(page.locator(TOGGLE)).toHaveAttribute('aria-pressed', 'true');
  },
  async (page) => {
    expect(await style(page.locator(TOGGLE), 'border-top-color')).toBe(await colour(page, '--ocx-color-accent'));
  },
);

// Fields: the Select control's hover border fades; a field's focus border lands at once (D-R7 g).
row(
  'Select control hover',
  story('select'),
  SELECT,
  ['border-color'],
  async (page) => {
    await page.locator(`${SELECT} .ocx-ui-select__control`).hover();
  },
  async (page) => {
    const control = page.locator(`${SELECT} .ocx-ui-select__control`);
    expect(await style(control, 'border-top-color')).toBe(await colour(page, '--ocx-color-hover-border'));
  },
);
test('Input: the focus border never animates', async ({ page }) => {
  await page.goto(story('input'));
  await slow(page);
  await page.locator('#story .ocx-ui-input').focus();
  expect(await animating(page, '#story')).toEqual([]);
});

// SearchField: the clear button fades with the value, its box reserved.
const SEARCH = '#story .ocx-ui-search-field';
row(
  'SearchField clear',
  story('search-field'),
  SEARCH,
  ['opacity', 'visibility'],
  async (page) => {
    await page.locator(`${SEARCH} input`).fill('cli');
  },
  async (page) => {
    expect(await style(page.locator(`${SEARCH} .ocx-ui-search-field__clear`), 'opacity')).toBe('1');
  },
);
test('SearchField: the clear box is reserved, so typing never reflows the input', async ({ page }) => {
  await page.goto(story('search-field'));
  const input = page.locator(`${SEARCH} input`);
  const before = await input.boundingBox();
  await input.fill('cli');
  await expect(page.locator(`${SEARCH} .ocx-ui-search-field__clear`)).toBeVisible();
  expect(await input.boundingBox()).toEqual(before);
});

// Breadcrumbs: link hover ink, the fold button's open ink.
const CRUMBS = '#story .ocx-ui-crumbs';
row(
  'Breadcrumbs link hover',
  story('breadcrumbs'),
  CRUMBS,
  ['color'],
  async (page) => {
    await hover(page, page.locator(`${CRUMBS} a`).first());
  },
  async (page) => {
    expect(await style(page.locator(`${CRUMBS} a`).first(), 'color')).toBe(await colour(page, '--ocx-color-fg'));
  },
);
const FOLD = '#story .ocx-ui-crumbs__more:has(> [aria-label="Show 2 more"])';
row(
  'Breadcrumbs fold open',
  story('breadcrumbs', 'states'),
  FOLD,
  ['background-color'],
  async (page) => {
    await page.locator(`${FOLD} > button`).focus(); // keyboard open: no hover ink before it
    await page.keyboard.press('Enter');
  },
  async (page) => {
    expect(await style(page.locator(`${FOLD} > button`), 'background-color')).toBe(
      await colour(page, '--ocx-color-hover'),
    );
  },
);
