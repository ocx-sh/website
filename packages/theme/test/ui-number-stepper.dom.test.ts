// @vitest-environment jsdom
// Number stepper script: a click steps the input, fires input then change, keeps focus in the input,
// and disables the button that hit min / max.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install, sync } from '../src/components/ui/number-stepper.mjs';

afterEach(() => {
  document.body.innerHTML = '';
});

const place = (attrs = 'value="3" min="0" max="5"') => {
  document.body.innerHTML = `<div class="ocx-ui-input-group"><input type="number" ${attrs}>
    <span class="ocx-ui-stepper"><button type="button" data-step="down"><svg id="i"></svg></button>
    <button type="button" data-step="up"></button></span></div>`;
  const input = document.querySelector<HTMLInputElement>('input')!;
  const [down, up] = [...document.querySelectorAll<HTMLButtonElement>('[data-step]')] as [
    HTMLButtonElement,
    HTMLButtonElement,
  ];
  const log: string[] = [];
  for (const t of ['input', 'change']) input.addEventListener(t, () => log.push(t));
  return { input, down, up, log };
};

describe('number stepper', () => {
  beforeAll(() => install());

  it('steps up and down, fires input then change, focuses the input', () => {
    const { input, down, up, log } = place();
    up.click();
    expect(input.value).toBe('4');
    expect(log).toEqual(['input', 'change']);
    expect(document.activeElement).toBe(input);
    down.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.value).toBe('3');
  });

  it('disables the button at a bound and re-enables it when the value moves away', () => {
    const { input, down, up } = place('value="4" min="0" max="5"');
    up.click();
    expect(input.value).toBe('5');
    expect(up.disabled).toBe(true);
    expect(down.disabled).toBe(false);
    up.disabled = false; // a forced click past max still clamps natively
    up.click();
    expect(input.value).toBe('5');
    down.click();
    expect(up.disabled).toBe(false);
  });

  it('typing re-syncs the buttons', () => {
    const { input, down, up } = place();
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect([down.disabled, up.disabled]).toEqual([true, false]);
  });

  it('a readonly or disabled input disables both buttons; an empty one steps from zero', () => {
    for (const flag of ['readonly', 'disabled']) {
      const { input, down, up } = place(`value="3" ${flag}`);
      sync(input);
      expect([down.disabled, up.disabled], flag).toEqual([true, true]);
    }
    const empty = place('min="0"');
    empty.up.click();
    expect(empty.input.value).toBe('1');
  });
});
