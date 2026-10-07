// @ocx-sh/theme/lazy: the generic trigger layer, with no Zag import.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { mount } from '../src/components/ui/lazy.mjs';

it('starts on first interaction, passes root and the replayed key to start, and reports live', async () => {
  document.body.innerHTML = '<div data-zag-root="x"><button>b</button></div>';
  const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
  const start = vi.fn(() => ({ api: 'A', stop() {} }));
  const handle = mount(root, { load: () => Promise.resolve({ start }) });
  expect(root.dataset['zagState']).toBeUndefined();
  root.dispatchEvent(new Event('pointerenter'));
  expect(root.dataset['zagState']).toBe('loading');
  root.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await handle.ready;
  expect(root.dataset['zagState']).toBe('live');
  expect(start).toHaveBeenCalledWith(root, expect.any(KeyboardEvent));
  expect(handle.api).toBe('A');
});

it('a failing load ends in data-zag-state="error"', async () => {
  document.body.innerHTML = '<div data-zag-root="x"></div>';
  const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const handle = mount(root, { load: () => Promise.reject(new Error('no')), trigger: 'manual' });
  await handle.start();
  expect(root.dataset['zagState']).toBe('error');
  spy.mockRestore();
});

it('imports nothing, so @zag-js/vanilla never rides along', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/components/ui/lazy.mjs'), 'utf8');
  expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\bimport\b\s*(?:[\w{*(]|['"])/);
});
