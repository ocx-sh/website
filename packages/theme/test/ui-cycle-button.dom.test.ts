// @vitest-environment jsdom
// CycleButton script: one delegated listener advances the state (wrapping), swaps the current glyph,
// rewrites value, name (aria-label), shown label and hidden input, and emits a cancelable
// ocx:cycle-button:change.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install, setValue } from '../src/components/ui/cycle-button.mjs';

beforeAll(() => install());
afterEach(() => {
  document.body.innerHTML = '';
});

const glyph = (current: boolean) =>
  `<svg class="ocx-ui-cycle-button__state${current ? ' ocx-ui-cycle-button__current' : ''}"></svg>`;
const NAMES = { a: 'A (click for B)', b: 'B (click for C)', c: 'C (click for A)' } as Record<string, string>;

const place = (attrs = '', initial = 'a', label = false) => {
  const values = ['a', 'b', 'c'];
  const cycle = JSON.stringify(values.map((v) => [v, v.toUpperCase()])).replaceAll('"', '&quot;');
  const glyphs = values.map((v) => glyph(v === initial)).join('');
  const text = label ? `<span class="ocx-ui-cycle-button__label">${initial.toUpperCase()}</span>` : '';
  document.body.innerHTML = `<div id="host"><button type="button" class="ocx-ui-cycle-button" data-value="${initial}" data-cycle="${cycle}" aria-label="${NAMES[initial]}" ${attrs}>${glyphs}${text}<input type="hidden" name="f" value="${initial}"><i id="child"></i></button></div>`;
  const button = document.querySelector<HTMLButtonElement>('button')!;
  const events: unknown[] = [];
  document
    .getElementById('host')!
    .addEventListener('ocx:cycle-button:change', (e) => events.push((e as CustomEvent).detail));
  const current = () => {
    const at = [...button.querySelectorAll('svg')].findIndex((g) =>
      g.classList.contains('ocx-ui-cycle-button__current'),
    );
    return values[at];
  };
  return { button, events, current };
};

describe('CycleButton script', () => {
  it('each click advances one state and wraps, emitting {value, previous}', () => {
    const { button, events, current } = place();
    button.click();
    expect(current()).toBe('b');
    button.click();
    button.click();
    expect(current()).toBe('a');
    expect(button.dataset['value']).toBe('a');
    expect(events).toEqual([
      { value: 'b', previous: 'a' },
      { value: 'c', previous: 'b' },
      { value: 'a', previous: 'c' },
    ]);
  });

  it('keeps exactly one glyph current, and updates the name and the hidden input', () => {
    const { button } = place();
    button.click();
    expect(button.querySelectorAll('.ocx-ui-cycle-button__current')).toHaveLength(1);
    expect(button.getAttribute('aria-label')).toBe('B (click for C)');
    expect(button.querySelector('input')!.value).toBe('b');
  });

  it('a shown label follows the state', () => {
    const { button } = place('', 'c', true);
    button.click();
    expect(button.querySelector('.ocx-ui-cycle-button__label')?.textContent).toBe('A');
    expect(button.getAttribute('aria-label')).toBe('A (click for B)');
  });

  it('a click on a child (a glyph) advances the button', () => {
    const { current } = place();
    document.getElementById('child')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(current()).toBe('b');
  });

  it('Enter and Space work through the native click of a focused button', () => {
    const { button, current } = place();
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click();
    expect(current()).toBe('b');
  });

  it('the first click sets data-live (the crossfade gate); setValue alone never does', () => {
    const { button } = place();
    setValue(button, 'b');
    expect(button.hasAttribute('data-live')).toBe(false);
    button.click();
    expect(button.hasAttribute('data-live')).toBe(true);
  });

  it('a cancelled change event keeps the state', () => {
    const { button, events, current } = place();
    button.addEventListener('ocx:cycle-button:change', (e) => e.preventDefault());
    button.click();
    expect(button.hasAttribute('data-live')).toBe(false);
    expect(current()).toBe('a');
    expect(button.dataset['value']).toBe('a');
    expect(events).toHaveLength(1);
  });

  it('a disabled button does nothing', () => {
    const { button, events, current } = place('disabled');
    button.click();
    expect(current()).toBe('a');
    expect(events).toEqual([]);
  });

  it('installing twice does not double-advance', () => {
    install();
    const { button, current } = place();
    button.click();
    expect(current()).toBe('b');
  });

  it('a click outside any cycle button does nothing', () => {
    const { events } = place();
    document.body.click();
    expect(events).toEqual([]);
  });

  it('setValue shows a state without an event; an unknown value changes nothing', () => {
    const { button, events, current } = place();
    expect(setValue(button, 'c')).toBe(true);
    expect(current()).toBe('c');
    expect(button.getAttribute('aria-label')).toBe('C (click for A)');
    expect(setValue(button, 'zzz')).toBe(false);
    expect(current()).toBe('c');
    expect(button.getAttribute('aria-label')).toBe('C (click for A)');
    expect(events).toEqual([]);
  });
});
