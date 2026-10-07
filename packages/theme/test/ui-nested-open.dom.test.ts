// @vitest-environment jsdom
// A closed Dialog/Drawer holding an open nested component must not start eagerly: only the
// component's OWN content part counts (rendersOpen for Dialog.astro/Drawer.astro, readDom for drawer.zag).
import { describe, expect, it } from 'vitest';
import { readDom } from '../src/components/ui/drawer.zag.mjs';
import { rendersOpen } from '../src/components/ui/zag.mjs';

const nested = '<div data-zag-root="list"><div data-part="content"></div></div>';
const place = (kind: string, ownHidden: boolean) => {
  document.body.innerHTML = `<div data-zag-root="${kind}"><div data-part="positioner"><div data-part="content"${ownHidden ? ' hidden' : ''}>${nested}</div></div></div>`;
  return document.querySelector<HTMLElement>(`[data-zag-root="${kind}"]`)!;
};
/** Whether drawer.zag's readDom believes the drawer rendered open (a close then differs from `last`). */
const drawerStartsOpen = (root: HTMLElement) => {
  let changes = 0;
  root.addEventListener('ocx:drawer:change', () => changes++);
  readDom(root).onOpenChange({ open: false });
  return changes === 1;
};

describe.each(['dialog', 'drawer'])('%s own-content check', (kind) => {
  const starts = (root: HTMLElement) => (kind === 'drawer' ? drawerStartsOpen(root) : rendersOpen(root));
  it('stays idle when closed with a nested open component', () => {
    expect(starts(place(kind, true))).toBe(false);
  });
  it('starts eagerly when rendered open', () => {
    expect(starts(place(kind, false))).toBe(true);
  });
});
