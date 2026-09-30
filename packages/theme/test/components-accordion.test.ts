// Z3 Accordion + AccordionItem (C-141) with the common wrapper contract C-130 (a) SSR = ssrApi,
// (b) root attributes, (g) ocx:accordion:change. Markup via the Container API (fixtures render
// real MDX-like compositions); the client runs the real accordion.zag.mjs through `mount` in jsdom.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { connect, machine } from '../src/components/accordion.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
type Component = Parameters<AstroContainer['renderToString']>[0];
const def = (m: unknown) => (m as { default: Component }).default;
const fixture = async (name: string): Promise<Component> => def(await import(`./fixtures/${name}.astro`));
const itemComponent = async (): Promise<Component> => def(await import(`../src/components/${'AccordionItem'}.astro`));

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** An Accordion (props passed through) holding real AccordionItems a, b, c. */
async function render(props: Record<string, unknown> = {}) {
  const html = await container.renderToString(await fixture('Accordion3'), { props });
  const { window: win } = new JSDOM(`<!doctype html><body>${html}</body>`);
  const root = win.document.querySelector<HTMLElement>('[data-zag-root="accordion"]');
  if (!root) throw new Error('no accordion root rendered');
  return { html, win, root };
}

function apiOf(root: HTMLElement) {
  const props = JSON.parse(root.dataset['zagProps'] ?? '{}') as Record<string, unknown>;
  return ssrApi(machine, connect, { ...props, id: root.dataset['zagId'] });
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

async function hydrate(win: Win, root: HTMLElement) {
  vi.stubGlobal('document', win.document);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('CustomEvent', win.CustomEvent); // emit() builds events from the global
  const events: unknown[] = [];
  root.addEventListener('ocx:accordion:change', (e) => events.push((e as CustomEvent).detail));
  mount(root, { load: () => import('../src/components/accordion.zag.mjs') });
  root.dispatchEvent(new win.Event('pointerenter'));
  await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
  const trigger = (v: string) => root.querySelector<HTMLButtonElement>(`[id$=":trigger:${v}"]`)!;
  const content = (v: string) => root.querySelector<HTMLElement>(`[id$=":content:${v}"]`)!;
  return { events, trigger, content };
}

const expanded = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-part="item-trigger"]')].map((t) => t.getAttribute('aria-expanded'));

describe('C-130 Accordion SSR', () => {
  for (const [state, props] of [
    ['one open', { value: ['a'] }],
    ['multiple open', { multiple: true, value: ['a', 'c'] }],
    ['all closed', { collapsible: true }],
  ] as const) {
    it(`C-130a (${state}): root, item, trigger and content equal ssrApi for the same props`, async () => {
      const { html, root } = await render(props);
      const api = apiOf(root);
      expectSsrMatchesConnect(html, 'root', {
        ...api.getRootProps(),
        'data-zag-root': 'accordion',
        'data-zag-state': 'idle',
        'data-zag-id': root.dataset['zagId'],
        'data-zag-props': root.dataset['zagProps'],
      });
      // expectSsrMatchesConnect checks the first part of a kind; check every item through a per-item document.
      for (const value of ['a', 'b', 'c']) {
        const item = root.querySelector(`[id$=":item:${value}"]`)!;
        expectSsrMatchesConnect(item.outerHTML, 'item', api.getItemProps({ value }));
        expectSsrMatchesConnect(item.outerHTML, 'item-trigger', api.getItemTriggerProps({ value }));
        expectSsrMatchesConnect(item.outerHTML, 'item-content', api.getItemContentProps({ value }));
      }
      expect(html).not.toMatch(/data-focus/);
    });
  }

  it('C-130b root carries data-zag-root="accordion", data-zag-state="idle", data-zag-props', async () => {
    const { root } = await render({ multiple: true, collapsible: true, value: ['b'] });
    expect(root.getAttribute('data-zag-state')).toBe('idle');
    expect(JSON.parse(root.dataset['zagProps'] ?? '')).toEqual({
      multiple: true,
      collapsible: true,
      defaultValue: ['b'],
    });
  });

  it('C-141 value opens those items on first paint; closed panels are hidden regions labelled by their trigger', async () => {
    const { root } = await render({ value: ['b'] });
    expect(expanded(root)).toEqual(['false', 'true', 'false']);
    for (const panel of root.querySelectorAll('[data-part="item-content"]')) {
      expect(panel.getAttribute('role')).toBe('region');
      const own = panel.closest('[data-part="item"]')?.querySelector('[data-part="item-trigger"]');
      expect(panel.getAttribute('aria-labelledby')).toBe(own?.id);
      expect(panel.hasAttribute('hidden')).toBe(panel.getAttribute('data-state') === 'closed');
    }
  });

  it('C-141 each trigger is a button inside a heading, labelled by the item label', async () => {
    const { root } = await render();
    const triggers = [...root.querySelectorAll('[data-part="item-trigger"]')];
    expect(triggers.map((t) => t.textContent.trim())).toEqual(['A', 'B', 'C']);
    for (const t of triggers) {
      expect(t.localName).toBe('button');
      expect(t.parentElement?.localName).toBe('h3');
    }
  });

  it('C-141 sibling accordions keep their own state; a nested one keeps its own items', async () => {
    const html = await container.renderToString(await fixture('TwoAccordions'));
    const { window: win } = new JSDOM(`<!doctype html><body>${html}</body>`);
    const roots = [...win.document.querySelectorAll<HTMLElement>('[data-zag-root="accordion"]')];
    expect(roots).toHaveLength(3);
    const own = (r: HTMLElement) =>
      [...r.querySelectorAll('[data-part="item-trigger"]')]
        .filter((t) => t.getAttribute('data-ownedby') === r.id)
        .map((t) => `${t.textContent.trim()}:${t.getAttribute('aria-expanded')}`);
    expect(roots.map(own)).toEqual([['A:true', 'B:false'], ['A2:false', 'B2:true'], ['N:false']]);
  });

  it('C-141 an item value that is not a slug fails the build with a clear message', async () => {
    const Item = await itemComponent();
    await expect(container.renderToString(Item, { props: { value: 'a b', label: 'X' } })).rejects.toThrow(
      /value must be a slug/,
    );
  });

  it('C-141 two items with one value fail the build (duplicate ids)', async () => {
    await expect(container.renderToString(await fixture('DuplicateValues'))).rejects.toThrow(
      /two items share value="a"/,
    );
  });

  it('C-141 no item mark survives into the rendered accordion', async () => {
    expect((await render()).html).not.toMatch(/data-ocx-accordion/);
  });
});

describe('C-141 Accordion client', () => {
  it('C-141 single mode: a click opens that item and closes the other; emits ocx:accordion:change {value}', async () => {
    const { win, root } = await render({ value: ['a'] });
    const { events, trigger, content } = await hydrate(win, root);
    trigger('b').click();
    await settle();
    expect(expanded(root)).toEqual(['false', 'true', 'false']);
    expect(content('a').hasAttribute('hidden')).toBe(true);
    expect(content('b').hasAttribute('hidden')).toBe(false);
    expect(events).toEqual([{ value: ['b'] }]);
  });

  // Owner 2026-09-30: collapsible is the default; a locked open item is aria-disabled (APG) and its
  // chevron hides, since a chevron promises the item closes.
  it('C-141 not collapsible: selecting the open item keeps it open (aria-disabled); the default closes it', async () => {
    const fixed = await render({ value: ['a'], collapsible: false });
    expect(fixed.root.querySelector('[aria-expanded="true"]')?.getAttribute('aria-disabled')).toBe('true');
    const f = await hydrate(fixed.win, fixed.root);
    f.trigger('a').click();
    await settle();
    expect(expanded(fixed.root)[0]).toBe('true');
    expect(f.trigger('a').getAttribute('aria-disabled')).toBe('true');
    f.trigger('b').click();
    await settle();
    expect(f.trigger('a').hasAttribute('aria-disabled')).toBe(false);
    expect(f.trigger('b').getAttribute('aria-disabled')).toBe('true');
    vi.unstubAllGlobals();
    const loose = await render({ value: ['a'] });
    const l = await hydrate(loose.win, loose.root);
    l.trigger('a').click();
    await settle();
    expect(expanded(loose.root)).toEqual(['false', 'false', 'false']);
    expect(l.events).toEqual([{ value: [] }]);
  });

  it('C-141 multiple: items open independently', async () => {
    const { win, root } = await render({ multiple: true, value: ['a'] });
    const { trigger, events } = await hydrate(win, root);
    trigger('c').click();
    await settle();
    expect(expanded(root)).toEqual(['true', 'false', 'true']);
    expect(events).toEqual([{ value: ['a', 'c'] }]);
  });

  it('C-141 APG keys: ArrowDown/ArrowUp move focus between triggers (wrapping), Home and End jump', async () => {
    const { win, root } = await render();
    const { trigger } = await hydrate(win, root);
    const key = async (from: HTMLElement, k: string) => {
      from.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
      await settle();
      return win.document.activeElement?.id ?? '';
    };
    trigger('a').focus();
    await settle();
    expect(await key(trigger('a'), 'ArrowDown')).toMatch(/:trigger:b$/);
    expect(await key(trigger('b'), 'ArrowUp')).toMatch(/:trigger:a$/);
    expect(await key(trigger('a'), 'End')).toMatch(/:trigger:c$/);
    expect(await key(trigger('c'), 'Home')).toMatch(/:trigger:a$/);
    expect(await key(trigger('a'), 'ArrowUp')).toMatch(/:trigger:c$/);
  });
});

describe('C-141 Accordion look', () => {
  it('C-141 each trigger holds its label and a decorative registry chevron after it', async () => {
    const { root } = await render({ value: ['a'] });
    for (const t of root.querySelectorAll('[data-part="item-trigger"]')) {
      const [label, chevron] = [...t.children];
      expect(label?.classList.contains('ocx-accordion__label')).toBe(true);
      expect(chevron?.getAttribute('data-icon')).toBe('chevron-down');
      expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
