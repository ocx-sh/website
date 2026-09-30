// Z6 overlays (C-170…C-174) under the common wrapper contract C-130: SSR of every showcase state
// equals connect() of an unstarted machine for the same props (a), root attributes (b), styles in
// @layer ocx keyed on Zag parts (f), public props (k). Behaviour is e2e (tests/e2e/zag-overlay.spec.ts).
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import * as dialog from '../src/components/ui/dialog.zag.mjs';
import * as drawer from '../src/components/ui/drawer.zag.mjs';
import * as menu from '../src/components/ui/menu.zag.mjs';
import * as popover from '../src/components/ui/popover.zag.mjs';
import * as tooltip from '../src/components/ui/tooltip.zag.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const C = {
  Popover: await load('Popover'),
  ActionMenu: await load('ActionMenu'),
  Dialog: await load('Dialog'),
  Drawer: await load('Drawer'),
  Hint: await load('Hint'),
};

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

type Opts = { props?: Record<string, unknown>; slots?: Record<string, string> };
async function render(c: Component, { props = {}, slots = {} }: Opts = {}): Promise<Document> {
  const html = await container.renderToString(c, { props, slots });
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

type Parts = Record<string, Record<string, unknown>>;
/** C-130a: every part the SSR rendered carries exactly the attributes connect() yields (a subset
 * check: Button adds its own class and data-variant). Returns the machine props SSR used. */
function expectSsrEqualsConnect(
  doc: Document,
  mod: { machine: unknown; connect: unknown },
  parts: (api: never) => Parts,
) {
  const root = doc.querySelector<HTMLElement>('[data-zag-root]');
  expect(root, 'no Zag root').not.toBeNull();
  const own = JSON.parse(root?.dataset['zagProps'] ?? 'null') as Record<string, unknown>;
  const api = ssrApi(mod.machine as never, mod.connect as never, { ...own, id: root?.dataset['zagId'] });
  let seen = 0;
  for (const [name, attrs] of Object.entries(parts(api as never))) {
    const el = doc.getElementById(String(attrs['id']));
    if (!el) continue;
    seen++;
    const actual = Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
    expect(actual, `part ${name}`).toMatchObject(ssrAttrs(attrs));
  }
  expect(doc.querySelector('[data-focus], [data-focus-visible]'), 'SSR has no live focus').toBeNull();
  return { root, own, seen };
}

/** C-130b: root carries the machine name, idle state, props and the id Zag derives part ids from. */
function expectRoot(root: HTMLElement | null, machine: string) {
  expect(root?.getAttribute('data-zag-root')).toBe(machine);
  expect(root?.getAttribute('data-zag-state')).toBe('idle');
  expect(root?.getAttribute('data-zag-id')).toMatch(/^ocx-ui-/);
  expect(root?.hasAttribute('data-zag-trigger'), 'interaction trigger (default)').toBe(false);
}

const items = [
  { value: 'copy', label: 'Copy digest' },
  { value: 'publish', label: 'Publish', disabled: true },
];
const button = '<button type="button" aria-label="Copy command">⧉</button>';

describe('C-170 Popover', () => {
  it('C-130a/b SSR equals connect() per state; the trigger names the closed, hidden panel', async () => {
    for (const props of [{}, { placement: 'top' }, { modal: true }]) {
      const doc = await render(C.Popover, { props, slots: { trigger: 'Details', default: 'Body' } });
      const { root, own, seen } = expectSsrEqualsConnect(doc, popover, popover.parts);
      expectRoot(root, 'popover');
      expect(seen).toBe(3);
      expect(own).toMatchObject({ modal: 'modal' in props, positioning: { strategy: 'fixed' } });
      const trigger = doc.querySelector('[data-part="trigger"]');
      const content = doc.querySelector('[data-part="content"]');
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect(trigger?.textContent).toContain('Details');
      expect(content?.hasAttribute('hidden')).toBe(true);
      expect(content?.getAttribute('aria-labelledby')).toBe(trigger?.id);
    }
  });

  it('C-106 placement and the zag passthrough reach the machine props; the named prop wins', async () => {
    const doc = await render(C.Popover, {
      props: { placement: 'top-end', zag: { closeOnEscape: false, positioning: { gutter: 2, placement: 'left' } } },
      slots: { trigger: 'x' },
    });
    const own: unknown = JSON.parse(doc.querySelector<HTMLElement>('[data-zag-root]')?.dataset['zagProps'] ?? '{}');
    expect(own).toEqual({
      closeOnEscape: false,
      modal: false,
      positioning: { gutter: 2, placement: 'top-end', strategy: 'fixed' },
    });
  });
});

describe('C-171 ActionMenu', () => {
  it('C-130a/b SSR equals connect(): trigger, menu, one menuitem per item, disabled marked', async () => {
    const doc = await render(C.ActionMenu, { props: { label: 'Actions', items } });
    const { root, seen } = expectSsrEqualsConnect(doc, menu, (api) => menu.parts(api, items));
    expectRoot(root, 'menu');
    expect(seen).toBe(5); // trigger, positioner, content, 2 items
    expect(doc.querySelector('[data-part="trigger"]')?.textContent).toContain('Actions');
    expect(doc.querySelector('[data-part="content"]')?.getAttribute('role')).toBe('menu');
    const rows = [...doc.querySelectorAll('[role="menuitem"]')];
    expect(rows.map((r) => [r.textContent, r.getAttribute('data-value'), r.getAttribute('aria-disabled')])).toEqual([
      ['Copy digest', 'copy', null],
      ['Publish', 'publish', 'true'],
    ]);
  });

  it('C-171 context mode: the slot is the context trigger, no trigger button, label names the menu', async () => {
    const doc = await render(C.ActionMenu, {
      props: { label: 'Package actions', items, context: true },
      slots: { default: '<p>Right-click here.</p>' },
    });
    const { own } = expectSsrEqualsConnect(doc, menu, (api) => menu.parts(api, items));
    expect(doc.querySelector('[data-part="trigger"]')).toBeNull();
    expect(doc.querySelector('[data-part="context-trigger"]')?.textContent).toContain('Right-click here.');
    expect(own['aria-label']).toBe('Package actions');
    expect(doc.querySelector('[data-part="content"]')?.getAttribute('aria-label')).toBe('Package actions');
  });
});

describe('C-172 Dialog', () => {
  it('C-130a/b SSR equals connect(): closed, hidden, modal by default, named by its title', async () => {
    const doc = await render(C.Dialog, {
      props: { title: 'Remove package', description: 'It leaves the lock file.' },
      slots: { trigger: 'Remove…', default: 'Body' },
    });
    const { root, own, seen } = expectSsrEqualsConnect(doc, dialog, dialog.parts);
    expectRoot(root, 'dialog');
    expect(seen).toBe(7);
    expect(own).toEqual({ defaultOpen: false, modal: true });
    const content = doc.querySelector('[data-part="content"]');
    expect(content?.getAttribute('role')).toBe('dialog');
    expect(content?.hasAttribute('hidden')).toBe(true);
    expect(content?.getAttribute('aria-labelledby')).toBe(doc.querySelector('[data-part="title"]')?.id);
    expect(doc.querySelector('[data-part="title"]')?.textContent).toBe('Remove package');
    expect(doc.querySelector('[data-part="close-trigger"]')?.getAttribute('aria-label')).toBe('Close');
  });

  it('C-172 modal=false, no description, no trigger slot', async () => {
    const doc = await render(C.Dialog, { props: { title: 'Plain', modal: false } });
    const { own } = expectSsrEqualsConnect(doc, dialog, dialog.parts);
    expect(own).toEqual({ defaultOpen: false, modal: false });
    expect(doc.querySelector('[data-part="trigger"]')).toBeNull();
    expect(doc.querySelector('[data-part="description"]')).toBeNull();
    expect(doc.querySelector('[data-part="content"]')?.getAttribute('aria-modal')).toBe('false');
  });

  it('C-172 open renders the dialog open on first paint', async () => {
    const doc = await render(C.Dialog, { props: { title: 'Open', open: true } });
    expectSsrEqualsConnect(doc, dialog, dialog.parts);
    expect(doc.querySelector('[data-part="content"]')?.hasAttribute('hidden')).toBe(false);
  });
});

describe('C-173 Drawer', () => {
  it('C-130a/b SSR equals connect() for every side; side maps to the swipe direction', async () => {
    for (const [side, swipeDirection] of [
      [undefined, 'start'],
      ['end', 'end'],
      ['bottom', 'down'],
    ] as const) {
      const doc = await render(C.Drawer, {
        props: { title: 'Sections', ...(side && { side }) },
        slots: { trigger: 'Open', default: 'Body' },
      });
      const { root, own, seen } = expectSsrEqualsConnect(doc, drawer, drawer.parts);
      expectRoot(root, 'drawer');
      expect(seen).toBe(6); // no description
      expect(own).toEqual({ defaultOpen: false, modal: true, swipeDirection });
      expect(root?.getAttribute('data-side')).toBe(side ?? 'start');
      expect(doc.querySelector('[data-part="positioner"]')?.hasAttribute('hidden')).toBe(true);
      expect(doc.querySelector('[data-part="content"]')?.getAttribute('aria-labelledby')).toBe(
        doc.querySelector('[data-part="title"]')?.id,
      );
    }
  });
});

describe('C-174 Hint', () => {
  it('C-130a/b the slotted button is the trigger part; it keeps its aria-label; hint hidden', async () => {
    const doc = await render(C.Hint, { props: { label: 'copy command' }, slots: { default: button } });
    const { root, own, seen } = expectSsrEqualsConnect(doc, tooltip, tooltip.parts);
    expectRoot(root, 'tooltip');
    expect(seen).toBe(3);
    expect(own).toMatchObject({ openDelay: 400, positioning: { placement: 'bottom', strategy: 'fixed' } });
    const trigger = doc.querySelector('button[data-part="trigger"]');
    expect(trigger?.getAttribute('aria-label')).toBe('Copy command');
    expect(trigger?.hasAttribute('aria-describedby'), 'describes only while shown').toBe(false);
    const content = doc.querySelector('[data-part="content"]');
    expect(content?.textContent).toBe('copy command');
    expect(content?.getAttribute('role')).toBe('tooltip');
    expect(content?.hasAttribute('hidden')).toBe(true);
  });

  it('C-174 openDelay reaches the machine; a slot that is not one button or link throws', async () => {
    const doc = await render(C.Hint, { props: { label: 'x', openDelay: 0 }, slots: { default: button } });
    expect(JSON.parse(doc.querySelector<HTMLElement>('[data-zag-root]')?.dataset['zagProps'] ?? '{}')).toMatchObject({
      openDelay: 0,
    });
    await expect(render(C.Hint, { props: { label: 'x' }, slots: { default: 'text' } })).rejects.toThrow(/Hint/);
    // The hint owns the button's id: a second id would win in the parser and orphan the hint.
    await expect(
      render(C.Hint, { props: { label: 'x' }, slots: { default: '<button id="mine" aria-label="y">y</button>' } }),
    ).rejects.toThrow(/must not set id/);
  });
});

describe('C-130f styles', () => {
  it.each(['Popover', 'ActionMenu', 'Dialog', 'Drawer', 'Hint'])(
    '%s: one <style>, all of it in @layer ocx, keyed on Zag data-part, tokens only',
    (name) => {
      const src = readFileSync(new URL(`../src/components/ui/${name}.astro`, import.meta.url), 'utf8');
      const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => (m[1] ?? '').trim());
      expect(styles).toHaveLength(1);
      expect(styles[0]).toMatch(/^@layer ocx \{[\s\S]*\}$/);
      expect(styles[0]).toMatch(/\[data-part='content'\]/);
      expect(styles[0]?.replace(/var\([^)]*\)/g, ''), 'no literal colours').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    },
  );
});
