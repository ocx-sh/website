// @vitest-environment jsdom
// C-200 TreeView (owner finding 2026-09-28): a pointerdown outside the tree clears the selection;
// inside it, or on a tree with nothing selectable, it does not. Markup is the minimal shape
// readDom reads (TreeView.astro SSR); the live machine is covered in components-collections.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { readDom } from '../src/components/tree-view.zag.mjs';

const place = (selectable: boolean) => {
  document.body.innerHTML =
    `<div data-zag-root="tree-view" data-selectable="${selectable}" data-zag-props="{}">` +
    '<ul data-part="tree"><li data-part="item" data-value="a"><span><span class="ocx-tree-view__name">a</span></span></li></ul>' +
    '</div><p id="outside">outside</p>';
  const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
  const updates: unknown[] = [];
  const props = readDom(root, (p) => updates.push(p.selectedValue));
  return { root, updates, props };
};
const down = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));

afterEach(() => {
  document.body.innerHTML = ''; // disconnects the root, so its listener removes itself
  down(document.body);
});

describe('C-200 TreeView outside click', () => {
  it('a pointerdown outside clears the selection and emits select', () => {
    const { root, updates, props } = place(true);
    const events: unknown[] = [];
    root.addEventListener('ocx:tree-view:select', (e) => events.push((e as CustomEvent).detail));
    props.onSelectionChange?.({ selectedValue: ['a'] } as never);
    down(document.getElementById('outside')!);
    expect(updates).toEqual([['a'], []]);
    expect(events).toEqual([{ value: ['a'] }, { value: [] }]);
  });

  it('a pointerdown inside keeps it; outside with nothing selected emits nothing', () => {
    const { root, updates, props } = place(true);
    down(document.getElementById('outside')!);
    expect(updates).toEqual([]);
    props.onSelectionChange?.({ selectedValue: ['a'] } as never);
    down(root.querySelector('.ocx-tree-view__name')!);
    expect(updates).toEqual([['a']]);
  });

  it('Escape on the tree still clears it (keyboard)', () => {
    const { root, updates, props } = place(true);
    props.onSelectionChange?.({ selectedValue: ['a'] } as never);
    root.querySelector('li')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(updates).toEqual([['a'], []]);
  });

  it('selectable stays opt-in: a non-selectable tree refuses selection and adds no listener', () => {
    const { updates, props } = place(false);
    props.onSelectionChange?.({ selectedValue: ['a'] } as never);
    down(document.getElementById('outside')!);
    expect(updates).toEqual([]);
  });
});
