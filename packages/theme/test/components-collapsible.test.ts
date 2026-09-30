// Z3 Collapsible (C-140) with the common wrapper contract C-130 (a) SSR = ssrApi, (b) root
// attributes, (g) ocx:collapsible:change. Markup via the Container API; the client runs the real
// collapsible.zag.mjs through `mount` in jsdom (document and requestAnimationFrame stubbed).
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { connect, machine } from '../src/components/collapsible.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
type Component = Parameters<AstroContainer['renderToString']>[0];
const load = async (): Promise<Component> =>
  ((await import(`../src/components/${'Collapsible'}.astro`)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function render(props: Record<string, unknown>, slots: Record<string, string> = { default: 'Body' }) {
  const html = await container.renderToString(await load(), { props, slots });
  const { window: win } = new JSDOM(`<!doctype html><body>${html}</body>`);
  const root = win.document.querySelector<HTMLElement>('[data-zag-root]');
  if (!root) throw new Error('no [data-zag-root] rendered');
  return { html, win, root };
}

/** The ssrApi the wrapper must have rendered from: its own data-zag-props plus data-zag-id. */
function apiOf(root: HTMLElement) {
  const props = JSON.parse(root.dataset['zagProps'] ?? '{}') as Record<string, unknown>;
  return ssrApi(machine, connect, { ...props, id: root.dataset['zagId'] });
}

const own = (root: HTMLElement) => ({
  'data-zag-root': 'collapsible',
  'data-zag-state': 'idle',
  'data-zag-id': root.dataset['zagId'],
  'data-zag-props': root.dataset['zagProps'],
});

// Several macrotasks: Zag sends in a microtask and ends `closing` on the next animation frame.
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Stub the globals Zag reads, mount, hover, and wait until the machine is live. */
async function hydrate(win: Win, root: HTMLElement) {
  vi.stubGlobal('document', win.document);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('CustomEvent', win.CustomEvent); // emit() builds events from the global
  const events: unknown[] = [];
  root.addEventListener('ocx:collapsible:change', (e) => events.push((e as CustomEvent).detail));
  mount(root, { load: () => import('../src/components/collapsible.zag.mjs') });
  root.dispatchEvent(new win.Event('pointerenter'));
  await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
  const trigger = root.querySelector<HTMLButtonElement>('[data-part="trigger"]')!;
  const content = root.querySelector<HTMLElement>('[data-part="content"]')!;
  return { events, trigger, content };
}

describe('C-130 Collapsible SSR', () => {
  for (const [state, props] of [
    ['closed', { label: 'More' }],
    ['open', { label: 'More', open: true }],
    ['disabled', { label: 'More', disabled: true }],
  ] as const) {
    it(`C-130a (${state}): root, trigger and content equal ssrApi for the same props, no data-focus`, async () => {
      const { html, root } = await render(props);
      const api = apiOf(root);
      expectSsrMatchesConnect(html, 'root', { ...api.getRootProps(), ...own(root) });
      expectSsrMatchesConnect(html, 'trigger', {
        ...api.getTriggerProps(),
        'aria-disabled': 'disabled' in props ? 'true' : undefined,
      });
      expectSsrMatchesConnect(html, 'content', api.getContentProps());
      expect(html).not.toMatch(/data-focus/);
    });
  }

  it('C-130b root carries data-zag-root="collapsible", data-zag-state="idle", data-zag-props', async () => {
    const { root } = await render({ label: 'More', open: true });
    expect(root.getAttribute('data-zag-root')).toBe('collapsible');
    expect(root.getAttribute('data-zag-state')).toBe('idle');
    expect(JSON.parse(root.dataset['zagProps'] ?? '')).toMatchObject({ defaultOpen: true, disabled: false });
  });

  it('C-106 zag passthrough reaches data-zag-props; named props win', async () => {
    const { root } = await render({ label: 'x', open: false, zag: { collapsedHeight: 40, defaultOpen: true } });
    expect(JSON.parse(root.dataset['zagProps'] ?? '')).toMatchObject({ collapsedHeight: 40, defaultOpen: false });
  });

  it('C-140 closed content is hidden, open content is not; the trigger is a real button', async () => {
    const closed = await render({ label: 'More' });
    const trigger = closed.root.querySelector('[data-part="trigger"]');
    expect(trigger?.localName).toBe('button');
    expect(trigger?.getAttribute('type')).toBe('button');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    const content = closed.root.querySelector('[data-part="content"]');
    expect(trigger?.getAttribute('aria-controls')).toBe(content?.id);
    expect(content?.hasAttribute('hidden')).toBe(true);
    const open = await render({ label: 'More', open: true });
    expect(open.root.querySelector('[data-part="content"]')?.hasAttribute('hidden')).toBe(false);
    expect(open.root.querySelector('[data-part="trigger"]')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('C-140 label is the trigger text; the trigger slot replaces it; the default slot is the content', async () => {
    const { root } = await render({ label: 'Label' }, { default: '<p>Inside</p>' });
    expect(root.querySelector('[data-part="trigger"]')?.textContent.trim()).toBe('Label');
    expect(root.querySelector('[data-part="content"] p')?.textContent).toBe('Inside');
    const slotted = await render({ label: 'Label' }, { trigger: '<span>Rich <code>x</code></span>', default: 'b' });
    expect(slotted.root.querySelector('[data-part="trigger"] code')?.textContent).toBe('x');
    expect(slotted.root.querySelector('[data-part="trigger"]')?.textContent).not.toContain('Label');
  });

  it('C-140 a disabled trigger reads as disabled (aria-disabled, data-disabled)', async () => {
    const { root } = await render({ label: 'More', disabled: true });
    const trigger = root.querySelector('[data-part="trigger"]');
    expect(trigger?.getAttribute('aria-disabled')).toBe('true');
    expect(trigger?.hasAttribute('data-disabled')).toBe(true);
  });

  it('C-140 no label and no trigger slot fails the build (the button would have no name)', async () => {
    await expect(render({})).rejects.toThrow(/needs a `label` or a `trigger` slot/);
  });

  it('C-140 two collapsibles get distinct ids', async () => {
    const a = (await render({ label: 'a' })).root.dataset['zagId'];
    const b = (await render({ label: 'b' })).root.dataset['zagId'];
    expect(a).not.toBe(b);
  });
});

describe('C-140 Collapsible client', () => {
  it('C-140 a click toggles aria-expanded and hidden, and emits ocx:collapsible:change {open}', async () => {
    const { win, root } = await render({ label: 'More' });
    const { events, trigger, content } = await hydrate(win, root);
    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.hasAttribute('hidden')).toBe(false);
    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(content.hasAttribute('hidden')).toBe(true);
    expect(events).toEqual([{ open: true }, { open: false }]);
  });

  it('C-140 going live changes no attribute of the SSR markup (first paint is final)', async () => {
    for (const props of [{ label: 'a' }, { label: 'b', open: true }]) {
      const { win, root } = await render(props);
      const snapshot = (el: Element) =>
        [...el.querySelectorAll('[data-part]')].map((p) =>
          Object.fromEntries([...p.attributes].filter((a) => a.name !== 'style').map((a) => [a.name, a.value])),
        );
      const before = snapshot(root);
      await hydrate(win, root);
      await settle();
      expect(snapshot(root)).toEqual(before);
    }
  });

  it('C-140 a disabled collapsible ignores clicks and emits nothing', async () => {
    const { win, root } = await render({ label: 'More', disabled: true });
    const { events, trigger, content } = await hydrate(win, root);
    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(content.hasAttribute('hidden')).toBe(true);
    expect(events).toEqual([]);
  });

  it('C-140 a collapsible nested in the content keeps its own parts', async () => {
    const inner = await render({ label: 'inner' });
    const { win, root } = await render({ label: 'outer', open: true }, { default: inner.html });
    const { trigger } = await hydrate(win, root);
    trigger.click();
    await settle();
    const nested = root.querySelector<HTMLElement>('[data-part="content"] [data-zag-root]')!;
    expect(nested.querySelector('[data-part="trigger"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(nested.dataset['zagState']).toBe('idle');
  });

  it('C-104 an early click on a nested trigger is replayed once, by the nested root only', async () => {
    const inner = await render({ label: 'inner' });
    const { win, root } = await render({ label: 'outer', open: true }, { default: inner.html });
    vi.stubGlobal('document', win.document);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    vi.stubGlobal('CustomEvent', win.CustomEvent);
    vi.stubGlobal('MouseEvent', win.MouseEvent);
    vi.stubGlobal('KeyboardEvent', win.KeyboardEvent);
    const nested = root.querySelector<HTMLElement>('[data-part="content"] [data-zag-root]')!;
    const load = () => import('../src/components/collapsible.zag.mjs');
    let release = (): void => {};
    const outerLoaded = new Promise<void>((r) => (release = r));
    mount(nested, { load });
    mount(root, { load: () => outerLoaded.then(load) }); // the outer chunk arrives later
    const trigger = nested.querySelector<HTMLButtonElement>('[data-part="trigger"]')!;
    trigger.dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }));
    trigger.click(); // before either machine is live: both roots see it
    await vi.waitFor(() => expect(nested.dataset['zagState']).toBe('live'));
    await settle();
    release();
    await vi.waitFor(() => expect(root.dataset['zagState']).toBe('live'));
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[data-part="trigger"]')?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('C-140 Collapsible look', () => {
  it('C-140 the trigger holds the label (or trigger slot) and a decorative registry chevron after it', async () => {
    for (const [props, slots] of [
      [{ label: 'More' }, undefined],
      [{}, { default: 'Body', trigger: '<em>Rich</em>' }],
    ] as const) {
      const { root } = await render(props, slots);
      const [label, chevron] = [...root.querySelector('[data-part="trigger"]')!.children];
      expect(label?.classList.contains('ocx-collapsible__label')).toBe(true);
      expect(chevron?.getAttribute('data-icon')).toBe('chevron-down');
      expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    }
    expect((await render({}, { default: 'Body', trigger: '<em>Rich</em>' })).root.textContent).toContain('Rich');
  });
});

// Open/close motion is shared by Collapsible and Accordion (ui/disclosure.css).
describe('disclosure motion (ui/disclosure.css)', () => {
  const read = (f: string) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8');
  const css = read('ui/disclosure.css');

  it('both components import it', () => {
    for (const file of ['Collapsible.astro', 'AccordionItem.astro'])
      expect(/^---([\s\S]*?)\n---/.exec(read(file))?.[1], file).toMatch(/import\s+['"]\.\/ui\/disclosure\.css['"]/);
  });

  it('every rule is gated on a live root, so an SSR-open item never animates on load', () => {
    const selectors = [...css.matchAll(/^ {2}(\S[^\n{}]*)\{/gm)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) expect(sel).toMatch(/^\[data-zag-state='live'\]/);
  });

  it('height, padding, opacity and display transition on motion tokens; closed collapses to height 0', () => {
    expect(css).toMatch(/interpolate-size:\s*allow-keywords/);
    expect(css).toMatch(/display var\(--ocx-duration-moderate\) allow-discrete/);
    for (const prop of ['height', 'padding-block-end', 'opacity'])
      expect(css).toContain(`${prop} var(--ocx-duration-moderate) var(--ocx-ease-in-out)`);
    expect(css).toMatch(/\[hidden\]\s*\{[^}]*height:\s*0;[^}]*opacity:\s*0/);
    expect(css).toMatch(/@starting-style\s*\{[^}]*height:\s*0/);
  });
});
