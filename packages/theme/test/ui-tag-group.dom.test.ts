// @vitest-environment jsdom
// TagGroup removal script (C-272, selectionMode none): a remove click or Backspace/Delete dispatches a
// cancelable ocx:tag-group:remove {value}; not prevented, the <li> goes and focus moves next, else
// previous, else to the group root.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install } from '../src/components/ui/tag-group.mjs';

beforeAll(() => install());
afterEach(() => {
  document.body.innerHTML = '';
});

const chip = (value: string, disabled = false) =>
  `<li><span class="ocx-ui-tag" data-value="${value}" data-removable>${value}<button type="button" class="ocx-ui-tag__remove" aria-label="Remove ${value}"${disabled ? ' disabled' : ''}></button></span></li>`;

const place = (...names: string[]) => {
  document.body.innerHTML = `<div id="host"><span id="l">Tags</span><ul class="ocx-ui-tag-group" role="list" aria-labelledby="l" tabindex="-1" data-ocx-tag-group>${names
    .map((v) => chip(v.replace('!', ''), v.endsWith('!')))
    .join('')}</ul></div>`;
  const events: unknown[] = [];
  document
    .getElementById('host')!
    .addEventListener('ocx:tag-group:remove', (e) => events.push((e as CustomEvent).detail));
  const root = document.querySelector<HTMLElement>('ul')!;
  const remove = (value: string) =>
    root.querySelector<HTMLButtonElement>(`[data-value="${value}"] .ocx-ui-tag__remove`)!;
  const values = () => [...root.querySelectorAll<HTMLElement>('[data-value]')].map((t) => t.dataset['value']);
  return { root, remove, values, events };
};

const key = (el: Element, k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

describe('TagGroup removal', () => {
  it('a click removes the chip, emits {value}, and focuses the next remove button', () => {
    const { remove, values, events } = place('a', 'b', 'c');
    remove('b').click();
    expect(values()).toEqual(['a', 'c']);
    expect(events).toEqual([{ value: 'b' }]);
    expect(document.activeElement).toBe(remove('c'));
  });

  it('the last chip hands focus to the previous remove button', () => {
    const { remove, values } = place('a', 'b');
    remove('b').click();
    expect(values()).toEqual(['a']);
    expect(document.activeElement).toBe(remove('a'));
  });

  it('the only chip hands focus to the group root; the list stays', () => {
    const { root, remove, values } = place('a');
    remove('a').click();
    expect(values()).toEqual([]);
    expect(document.activeElement).toBe(root);
    expect(document.getElementById('l')).not.toBeNull();
  });

  it('a disabled neighbour is skipped as a focus target', () => {
    const { root, remove } = place('a', 'b!');
    remove('a').click();
    expect(document.activeElement).toBe(root);
  });

  it('preventDefault keeps the chip and focus', () => {
    const { remove, values, events } = place('a', 'b');
    document.addEventListener('ocx:tag-group:remove', (e) => e.preventDefault(), { once: true });
    remove('a').focus();
    remove('a').click();
    expect(values()).toEqual(['a', 'b']);
    expect(events).toEqual([{ value: 'a' }]);
    expect(document.activeElement).toBe(remove('a'));
  });

  it.each(['Backspace', 'Delete'])('%s on a focused remove button acts as a click', (k) => {
    const { remove, values, events } = place('a', 'b');
    remove('a').focus();
    expect(key(remove('a'), k).defaultPrevented).toBe(true);
    expect(values()).toEqual(['b']);
    expect(events).toEqual([{ value: 'a' }]);
    expect(document.activeElement).toBe(remove('b'));
  });

  it('other keys, and remove buttons outside a TagGroup, are left alone', () => {
    const { remove, values, events } = place('a');
    expect(key(remove('a'), 'Enter').defaultPrevented).toBe(false);
    document.body.insertAdjacentHTML('beforeend', `<ul>${chip('z')}</ul>`);
    document.querySelector<HTMLButtonElement>('[data-value="z"] button')!.click();
    expect(values()).toEqual(['a']);
    expect(document.querySelector('[data-value="z"]')).not.toBeNull();
    expect(events).toEqual([]);
  });

  it('a disabled remove button does nothing', () => {
    const { remove, values, events } = place('a!');
    remove('a').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(values()).toEqual(['a']);
    expect(events).toEqual([]);
  });
});
