// @vitest-environment jsdom
// ToggleButton script (C-267): one delegated listener flips aria-pressed and emits
// ocx:toggle-button:change; disabled buttons and Zag items (data-scope) are left alone.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install } from '../src/components/ui/toggle-button.mjs';

beforeAll(() => install());
afterEach(() => {
  document.body.innerHTML = '';
});

const place = (attrs = '', inner = 'linux') => {
  document.body.innerHTML = `<div id="host"><button type="button" class="ocx-ui-toggle-button" aria-pressed="false" ${attrs}>${inner}</button></div>`;
  const button = document.querySelector<HTMLButtonElement>('button')!;
  const events: unknown[] = [];
  document
    .getElementById('host')!
    .addEventListener('ocx:toggle-button:change', (e) => events.push((e as CustomEvent).detail));
  return { button, events };
};

describe('ToggleButton script', () => {
  it('a click flips aria-pressed both ways and emits {pressed, value} through a bubbling event', () => {
    const { button, events } = place('data-value="linux"');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(events).toEqual([
      { pressed: true, value: 'linux' },
      { pressed: false, value: 'linux' },
    ]);
  });

  it('a click on a child (an icon) toggles the button', () => {
    const { button, events } = place('', '<svg id="i"></svg>');
    document.getElementById('i')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(events).toEqual([{ pressed: true, value: undefined }]);
  });

  it('a disabled button does nothing', () => {
    const { button, events } = place('disabled');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(events).toEqual([]);
  });

  it('an element with data-scope (a Zag item) is ignored', () => {
    const { button, events } = place('data-scope="toggle-group" data-part="item"');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(events).toEqual([]);
  });

  it('a click outside any toggle button does nothing', () => {
    const { events } = place();
    document.body.click();
    expect(events).toEqual([]);
  });
});
