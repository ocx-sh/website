// @vitest-environment jsdom
// Expressive Code copy buttons -> toast (C-182): toaster.mjs only recognises the click, and the first one
// loads toaster-code-copy.mjs, which watches EC's own feedback and toasts. A load that outlasts the feedback
// must still toast, so an already showing feedback counts as copied.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installToaster } from '../src/starlight/toaster.mjs';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const stops: (() => void)[] = [];
const frame = (feedback = false) => {
  document.body.innerHTML = `<div class="expressive-code"><div class="copy"><div aria-live="polite">${feedback ? '<div>Copied!</div>' : ''}</div><button data-code="\u007f  \u007fnpm i foo\u007fnpm i bar">copy</button></div></div>`;
  const toasts: unknown[] = [];
  const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);
  document.addEventListener('ocx:toast', onToast);
  stops.push(() => document.removeEventListener('ocx:toast', onToast));
  return { button: document.querySelector('button')!, live: document.querySelector('[aria-live]')!, toasts };
};

// One install for the file: its document listeners outlive a test's DOM.
beforeAll(async () => {
  installToaster(document);
  await import('../src/starlight/toaster-code-copy.mjs'); // the click's import() then resolves from the module cache
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('C-182 toaster-code-copy.mjs (loaded by the first click on an Expressive Code copy button)', () => {
  it('toasts "Copied" with the first non-blank line once EC adds its feedback', async () => {
    const { button, live, toasts } = frame();
    button.click();
    await tick();
    live.append(document.createElement('div'));
    await tick();
    expect(toasts).toEqual([{ title: 'Copied — npm i foo', duration: 2000, slot: 'copy' }]);
  });

  it('reads a feedback that was already showing as copied when the 1 s window ends', async () => {
    const { button, toasts } = frame(true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    button.click();
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(toasts).toEqual([{ title: 'Copied — npm i foo', duration: 2000, slot: 'copy' }]);
  });

  it('toasts "Copy failed" when EC shows no feedback within the window', async () => {
    const { button, toasts } = frame();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    button.click();
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(toasts).toEqual([{ title: 'Copy failed', tone: 'danger', slot: 'copy' }]);
  });

  it('ignores a click elsewhere and a copy button with no live region', async () => {
    const { toasts } = frame();
    document.body.click();
    document.querySelector('[aria-live]')!.remove();
    document.querySelector('button')!.click();
    await tick();
    await tick();
    expect(toasts).toEqual([]);
  });
});
