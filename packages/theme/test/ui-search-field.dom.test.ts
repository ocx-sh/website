// @vitest-environment jsdom
// SearchField script (C-269): clear click and Escape empty the input, fire input, move focus and
// announce ocx:search-field:clear; Escape stops propagation only when there was text to clear.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { install } from '../src/components/ui/search-field.mjs';

beforeAll(() => install());
afterEach(() => {
  document.body.innerHTML = '';
});

const place = (value = '') => {
  document.body.innerHTML = `<div id="host"><div class="ocx-ui-field ocx-ui-search-field">
    <div class="ocx-ui-input-group"><input class="ocx-ui-input-group__input" type="search" value="${value}">
    <button type="button" class="ocx-ui-button ocx-ui-search-field__clear" aria-label="Clear"><svg id="x"></svg></button></div></div>
    <button id="other">other</button></div>`;
  const input = document.querySelector<HTMLInputElement>('input')!;
  const host = document.getElementById('host')!;
  const log: string[] = [];
  input.addEventListener('input', () => log.push('input'));
  host.addEventListener('ocx:search-field:clear', () => log.push('clear'));
  return { input, host, log, button: document.querySelector<HTMLButtonElement>('.ocx-ui-search-field__clear')! };
};
const esc = (target: Element) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('SearchField script', () => {
  it('clear click empties the value, fires input then clear, and focuses the input', () => {
    const { input, log, button } = place('zag');
    document.getElementById('other')!.focus();
    button.click();
    expect(input.value).toBe('');
    expect(log).toEqual(['input', 'clear']);
    expect(document.activeElement).toBe(input);
  });

  it('a click on the icon inside the clear button clears too', () => {
    const { input } = place('zag');
    document.getElementById('x')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(input.value).toBe('');
  });

  it('Escape on a non-empty field clears it, prevents default and stops propagation', () => {
    const { input, host, log } = place('zag');
    const reached = vi.fn();
    host.addEventListener('keydown', reached);
    document.addEventListener('keydown', reached);
    const event = esc(input);
    expect(input.value).toBe('');
    expect(log).toEqual(['input', 'clear']);
    expect(event.defaultPrevented).toBe(true);
    expect(reached).not.toHaveBeenCalled();
    document.removeEventListener('keydown', reached);
  });

  it('Escape on an empty field does nothing and keeps propagating', () => {
    const { input, host, log } = place('');
    const reached = vi.fn();
    host.addEventListener('keydown', reached);
    const event = esc(input);
    expect(log).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    expect(reached).toHaveBeenCalledOnce();
  });

  it('other keys and inputs outside a search field are ignored', () => {
    const { input, log } = place('zag');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(input.value).toBe('zag');
    document.body.insertAdjacentHTML('beforeend', '<input id="plain" value="keep">');
    const plain = document.getElementById('plain') as HTMLInputElement;
    esc(plain);
    expect(plain.value).toBe('keep');
    expect(log).toEqual([]);
  });

  it('a readonly field keeps its value: clear click and Escape do nothing, Escape keeps propagating', () => {
    const { input, host, log, button } = place('zag');
    input.readOnly = true;
    const reached = vi.fn();
    host.addEventListener('keydown', reached);
    button.click();
    const event = esc(input);
    expect(input.value).toBe('zag');
    expect(log).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    expect(reached).toHaveBeenCalledOnce();
  });
});
