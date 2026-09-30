// @vitest-environment jsdom
// select.zag with slots: the popup hangs under the whole box (anchor = control part) and is built
// after it, never as a flex item among the addons; without slots both stay on the trigger.
import { describe, expect, it } from 'vitest';
import { connect, machine, readDom, render, toCollection } from '../src/components/ui/select.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';

const TRIGGER = '<button data-part="trigger"></button><span data-part="value-text"></span>';
const SELECT = '<select><option value="a">A</option></select>';
function fixture(grouped: boolean) {
  document.body.innerHTML = `<div data-zag-root="select" data-zag-props="{}">
    <label data-part="label"></label>
    ${grouped ? `<div data-part="control"><button id="dir"></button>${TRIGGER}</div>` : TRIGGER}
    <svg data-part="indicator"></svg>${SELECT}</div>`;
  return document.querySelector<HTMLElement>('[data-zag-root]')!;
}
const noop = () => {};
const api = () => ssrApi(machine, connect, { id: 's', collection: toCollection([{ value: 'a', label: 'A' }]) });
const anchorOf = (root: HTMLElement) =>
  (readDom(root, noop).positioning as { getAnchorElement?: () => Element | null }).getAnchorElement;

describe('select.zag with a slot box', () => {
  it('anchors the popup to the control part and builds it right after that box', () => {
    const root = fixture(true);
    const control = root.querySelector('[data-part="control"]');
    expect(anchorOf(root)?.()).toBe(control);
    render(api(), root, noop);
    expect(control?.nextElementSibling?.className).toBe('ocx-ui-select__positioner');
    expect(control?.querySelector('.ocx-ui-select__positioner')).toBeNull();
  });

  it('without slots: default anchor (the trigger), popup right after the trigger', () => {
    const root = fixture(false);
    expect(anchorOf(root)).toBeUndefined();
    render(api(), root, noop);
    expect(root.querySelector('[data-part="trigger"]')?.nextElementSibling?.className).toBe(
      'ocx-ui-select__positioner',
    );
  });
});
