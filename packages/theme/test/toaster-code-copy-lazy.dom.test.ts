// @vitest-environment jsdom
// C-182 the REAL lazy path: nothing here pre-imports toaster-code-copy.mjs, so the first click's import()
// really loads the chunk. EC adds its feedback while that load is in flight; the toast must not wait for the 1 s timer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installToaster } from '../src/starlight/toaster.mjs';

const frame = () => {
  document.body.innerHTML = `<div class="expressive-code"><div class="copy"><div aria-live="polite"></div><button data-code="\u007fnpm i foo">copy</button></div></div>`;
  const toasts: unknown[] = [];
  document.addEventListener('ocx:toast', (e) => toasts.push((e as CustomEvent).detail));
  return { button: document.querySelector('button')!, live: document.querySelector('[aria-live]')!, toasts };
};

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('../src/starlight/toaster-code-copy.mjs');
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('C-182 toaster.mjs first Expressive Code copy click (chunk not yet loaded)', () => {
  it('toasts at once when EC added its feedback while the chunk was loading', async () => {
    installToaster(document);
    const { button, live, toasts } = frame();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    button.click(); // starts the import(); the module is not cached yet
    live.append(document.createElement('div')); // EC's feedback lands before the chunk does
    await vi.dynamicImportSettled();
    expect(toasts).toEqual([{ title: 'Copied — npm i foo', duration: 2000, slot: 'copy' }]); // no timer advanced
  });

  it('logs once and does nothing else when the chunk fails to load', async () => {
    vi.doMock('../src/starlight/toaster-code-copy.mjs', () => {
      throw new Error('chunk 404');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    installToaster(document);
    const { button, toasts } = frame();
    button.click();
    await vi.dynamicImportSettled();
    await Promise.resolve();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('copy toast failed to load');
    expect(toasts).toEqual([]);
  });
});
