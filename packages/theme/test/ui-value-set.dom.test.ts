// @vitest-environment jsdom
// Programmatic setters (D-047): `ocx:toggle-group:set` / `ocx:select:set` `{ value }` on the root move
// the value with no change event, before the lazy machine starts (value-set.mjs rewrites the DOM the
// machine reads) and after (the *.zag.mjs listeners go through the machine's api).
import { describe, expect, it, vi } from 'vitest';
import * as toggleZag from '../src/components/toggle-group.zag.mjs';
import * as selectZag from '../src/components/ui/select.zag.mjs';
import { onSelectSet, onToggleGroupSet } from '../src/components/ui/value-set.mjs';
import { run, ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const attrs = (props: Record<string, unknown>) =>
  Object.entries(ssrAttrs(props))
    .map(([k, v]) => (v === true ? k : `${k}="${v}"`))
    .join(' ');

const ITEMS = ['linux', 'macos', 'windows'];
function toggleGroup(props: Record<string, unknown>) {
  const id = 'tg';
  const api = ssrApi(toggleZag.machine, toggleZag.connect, { id, ...props });
  document.body.innerHTML = `<div id="host"><div data-zag-root="toggle-group" data-zag-id="${id}" data-zag-state="idle"
    data-zag-props='${JSON.stringify(props)}' ${attrs(api.getRootProps())}>${ITEMS.map(
      (value) => `<button ${attrs(api.getItemProps({ value }))}>${value}</button>`,
    ).join('')}</div></div>`;
  return group();
}
const group = () => {
  const root = document.querySelector<HTMLElement>('[data-zag-root="toggle-group"]')!;
  const events: unknown[] = [];
  root.addEventListener('ocx:toggle-group:change', (e) => events.push((e as CustomEvent).detail));
  const pressed = () =>
    [...root.querySelectorAll('[data-part="item"]')]
      .filter((i) => i.getAttribute('data-state') === 'on')
      .map((i) => i.id.slice(root.id.length + 1));
  const set = (value: unknown) =>
    root.dispatchEvent(new CustomEvent('ocx:toggle-group:set', { detail: { value }, bubbles: true }));
  return { root, events, pressed, set };
};

describe('D-047 ToggleGroup set, machine not started', () => {
  document.addEventListener('ocx:toggle-group:set', onToggleGroupSet);

  it('D-047 single: moves aria-checked, data-state and the default the machine boots from', () => {
    const { root, set, pressed, events } = toggleGroup({ defaultValue: ['macos'], deselectable: false });
    set('windows');
    expect(pressed()).toEqual(['windows']);
    expect([...root.querySelectorAll('[role="radio"]')].map((i) => i.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    expect(JSON.parse(root.dataset['zagProps']!)).toEqual({ defaultValue: ['windows'], deselectable: false });
    expect(events).toEqual([]);
  });

  it('D-047 multiple: sets several, aria-pressed; an unknown value leaves every item off', () => {
    const { root, set, pressed } = toggleGroup({ defaultValue: ['linux'], multiple: true });
    set(['macos', 'windows']);
    expect(pressed()).toEqual(['macos', 'windows']);
    expect([...root.querySelectorAll('button')].map((i) => i.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'true',
    ]);
    set('elsewhere');
    expect(pressed()).toEqual([]);
    set(undefined);
    expect((JSON.parse(root.dataset['zagProps']!) as { defaultValue: string[] }).defaultValue).toEqual([]);
  });

  it('D-047 ignores an event outside a toggle group, a nested group, and a live machine', () => {
    const { root, set, pressed } = toggleGroup({ defaultValue: ['macos'], deselectable: false });
    document.body.dispatchEvent(new CustomEvent('ocx:toggle-group:set', { detail: { value: 'linux' }, bubbles: true }));
    root.dataset['zagState'] = 'live';
    set('linux');
    expect(pressed()).toEqual(['macos']);
  });

  it('D-047 a machine that starts after the set boots from it and announces nothing', () => {
    const { root, set, pressed, events } = toggleGroup({ defaultValue: ['macos'], deselectable: false });
    set('windows');
    const session = run(root, toggleZag, JSON.parse(root.dataset['zagProps']!) as Record<string, unknown>);
    expect(pressed()).toEqual(['windows']);
    expect(events).toEqual([]);
    session.stop();
  });
});

describe('D-047 ToggleGroup set, machine live', () => {
  it('D-047 moves the pressed item through the machine and emits no change event; a click still emits', async () => {
    const { root, set, pressed, events } = toggleGroup({ defaultValue: ['macos'], deselectable: false });
    const session = run(root, toggleZag, { defaultValue: ['macos'], deselectable: false });
    root.dataset['zagState'] = 'live';
    set('linux');
    await tick();
    expect(pressed()).toEqual(['linux']);
    expect(root.querySelector('[role="radio"][aria-checked="true"]')?.id).toBe(`${root.id}:linux`);
    expect(events).toEqual([]);
    root.querySelector<HTMLElement>(`[id="${root.id}:windows"]`)!.click();
    await tick();
    expect(events).toEqual([{ value: ['windows'] }]);
    set(['macos']);
    await tick();
    expect(pressed()).toEqual(['macos']);
    expect(events).toHaveLength(1);
    session.stop();
  });
});

describe('ToggleGroup set, silent is one-shot', () => {
  it("a set to the current value leaves no flag behind for the visitor's next click", async () => {
    const { root, set, events } = toggleGroup({ defaultValue: ['macos'], deselectable: false });
    const session = run(root, toggleZag, { defaultValue: ['macos'], deselectable: false });
    root.dataset['zagState'] = 'live';
    set('macos');
    await tick();
    root.querySelector<HTMLElement>(`[id="${root.id}:windows"]`)!.click();
    await tick();
    expect(events).toEqual([{ value: ['windows'] }]);
    session.stop();
  });
});

const OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Updated' },
  { value: 'rating', label: 'Rating', icon: '<svg id="r"></svg>' },
];
function select(selected = 'name') {
  const id = 'sel';
  const api = ssrApi(selectZag.machine, selectZag.connect, {
    id,
    defaultValue: [selected],
    collection: selectZag.toCollection(OPTIONS),
  });
  document.body.innerHTML = `<div data-zag-root="select" data-zag-id="${id}" data-zag-state="idle" data-zag-props="{}">
    <label ${attrs(api.getLabelProps())}>Sort</label>
    <button ${attrs(api.getTriggerProps())}><span class="ocx-ui-select__glyph"></span><span ${attrs(api.getValueTextProps())}>${api.valueAsString}</span></button>
    <svg ${attrs(api.getIndicatorProps())}></svg>
    <select ${attrs(api.getHiddenSelectProps())}>${OPTIONS.map(
      (o) =>
        `<option value="${o.value}" ${o.value === selected ? 'selected' : ''} ${o.icon ? `data-icon='${o.icon}'` : ''}>${o.label}</option>`,
    ).join('')}</select></div>`;
  const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
  const events: unknown[] = [];
  root.addEventListener('ocx:select:change', (e) => events.push((e as CustomEvent).detail));
  const set = (value: unknown) =>
    root.dispatchEvent(new CustomEvent('ocx:select:set', { detail: { value }, bubbles: true }));
  const text = () => root.querySelector('[data-part="value-text"]')!.textContent;
  return { root, events, set, text, native: root.querySelector('select')! };
}

describe('D-047 Select set, machine not started', () => {
  document.addEventListener('ocx:select:set', onSelectSet);

  it('D-047 writes the native select and the shown text; the trigger icon follows', () => {
    const { root, set, text, native } = select();
    set('rating');
    expect(native.value).toBe('rating');
    expect(text()).toBe('Rating');
    expect(root.querySelector<HTMLElement>('.ocx-ui-select__glyph')?.innerHTML).toBe('<svg id="r"></svg>');
  });

  it('D-047 a value no option carries, or a live machine, changes nothing', () => {
    const { root, set, text, native, events } = select();
    set('nope');
    root.dataset['zagState'] = 'live';
    set('updated');
    expect(native.value).toBe('name');
    expect(text()).toBe('Name');
    expect(events).toEqual([]);
    document.body.dispatchEvent(new CustomEvent('ocx:select:set', { detail: { value: 'updated' }, bubbles: true }));
  });

  it('D-047 a machine that starts after the set boots from it', () => {
    const { root, set, text, events } = select();
    set('updated');
    const session = run(root, selectZag, {});
    expect(text()).toBe('Updated');
    expect(events).toEqual([]);
    session.stop();
  });
});

describe('D-047 Select set, machine live', () => {
  it('D-047 moves the value through the machine, emits no change event, ignores unknown and same values', async () => {
    const { root, set, text, native, events } = select();
    const session = run(root, selectZag, {});
    root.dataset['zagState'] = 'live';
    set('updated');
    await tick();
    expect(text()).toBe('Updated');
    expect(native.value).toBe('updated');
    expect(events).toEqual([]);
    set('updated');
    set('nope');
    expect(text()).toBe('Updated');
    expect(events).toEqual([]);
    // A pick by the visitor still announces itself.
    const api = session.api as { setValue(v: string[]): void };
    api.setValue(['rating']);
    await tick();
    expect(events).toEqual([{ value: 'rating' }]);
    session.stop();
  });
});

describe('Select set, silent is one-shot', () => {
  it('a visitor choosing the value code just set is still announced', async () => {
    const { root, set, events } = select();
    const session = run(root, selectZag, {});
    root.dataset['zagState'] = 'live';
    const api = session.api as { setValue(v: string[]): void };
    set('updated');
    await tick();
    api.setValue(['name']);
    api.setValue(['updated']);
    await tick();
    expect(events).toEqual([{ value: 'name' }, { value: 'updated' }]);
    session.stop();
  });

  it('a set that moves nothing leaves no flag behind for the next visitor change', async () => {
    const { root, set, events } = select();
    const session = run(root, selectZag, {});
    root.dataset['zagState'] = 'live';
    set('name');
    set('nope');
    (session.api as { setValue(v: string[]): void }).setValue(['rating']);
    await tick();
    expect(events).toEqual([{ value: 'rating' }]);
    session.stop();
  });
});

describe('Select set, edge timing', () => {
  it('set A (moves) then set B (no-op against the not yet re-rendered api) back to back: A still emits no change event', async () => {
    const { root, set, events, text } = select();
    const session = run(root, selectZag, {});
    root.dataset['zagState'] = 'live';
    set('updated');
    set('name'); // the api is stale until Zag renders: this one reads as "already there" and is a no-op
    await tick();
    expect(text()).toBe('Updated');
    expect(events).toEqual([]);
    session.stop();
  });

  it('a set while the popup is open moves the value without a change event', async () => {
    // jsdom has no ResizeObserver; the popper's autoUpdate needs one.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { root, set, events, text } = select();
    const session = run(root, selectZag, {});
    root.dataset['zagState'] = 'live';
    const api = session.api as { setOpen(open: boolean): void; open: boolean };
    api.setOpen(true);
    await tick();
    set('rating');
    await tick();
    expect(text()).toBe('Rating');
    expect(events).toEqual([]);
    session.stop();
    vi.unstubAllGlobals();
  });

  it('a set during loading (after the mount trigger, before live) lands in the DOM and boots into the machine', () => {
    const { root, set, text, native, events } = select();
    root.dataset['zagState'] = 'loading';
    set('updated');
    expect(native.value).toBe('updated');
    const session = run(root, selectZag, JSON.parse(root.dataset['zagProps']!) as Record<string, unknown>);
    expect(text()).toBe('Updated');
    expect(events).toEqual([]);
    session.stop();
  });
});

describe('Select rows follow the native options', () => {
  const rows = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>('.ocx-ui-select__list [data-value]')].map((r) => r.dataset['value']);

  it('drops a row whose option is gone, builds rows from option data (icon, meta) and sets a swapped-in value at once', async () => {
    const { root, set, native, text, events } = select();
    const session = run(root, selectZag, {});
    root.dataset['zagState'] = 'live';
    expect(rows(root)).toEqual(['name', 'updated', 'rating']);
    const stars = new Option('Stars', 'stars');
    stars.dataset['icon'] = '<svg id="s"></svg>';
    stars.dataset['meta'] = '5';
    native.replaceChildren(stars, new Option('Name', 'name'));
    set('stars');
    await tick();
    expect(rows(root)).toEqual(['stars', 'name']);
    const row = root.querySelector<HTMLElement>('.ocx-ui-select__list [data-value="stars"]')!;
    expect(row.querySelector('.ocx-ui-option__icon')?.innerHTML).toBe('<svg id="s"></svg>');
    expect(row.querySelector('.ocx-ui-option__meta')?.textContent).toBe('5');
    expect(row.dataset['withIcon']).toBe('');
    expect(text()).toBe('Stars');
    expect(events).toEqual([]);
    session.stop();
  });
  it('a kept value whose option changed gets its row refreshed', async () => {
    const { root, set, native } = select();
    const session = run(root, selectZag, {});
    root.dataset['zagState'] = 'live';
    const name = new Option('Title', 'name');
    name.dataset['icon'] = '<svg id="n"></svg>';
    name.dataset['meta'] = 'm';
    native.replaceChildren(name, new Option('Updated', 'updated'));
    set('updated');
    await tick();
    const row = root.querySelector<HTMLElement>('.ocx-ui-select__list [data-value="name"]')!;
    expect(row.querySelector('.ocx-ui-option__label')?.textContent).toBe('Title');
    expect(row.querySelector('.ocx-ui-option__icon')?.innerHTML).toBe('<svg id="n"></svg>');
    expect(row.querySelector('.ocx-ui-option__meta')?.textContent).toBe('m');
    expect(row.dataset['withIcon']).toBe('');
    session.stop();
  });
});

vi.restoreAllMocks();
