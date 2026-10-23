// @vitest-environment jsdom
// copy.mjs: the write, the toast and their composition, called directly (the controls that use it are
// covered through their own tests).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyWithToast, toastCopy, writeClipboard } from '../src/components/copy.mjs';
import { COPY_TOAST_MS, COPY_TOAST_SLOT, copiedTitle } from '../src/components/toast.mjs';

const clipboard = (writeText: ((text: string) => Promise<void>) | undefined) =>
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
const toasts = () => {
  const seen: Array<Record<string, unknown>> = [];
  document.addEventListener('ocx:toast', (e) => seen.push((e as CustomEvent<Record<string, unknown>>).detail));
  return seen;
};

afterEach(() => {
  clipboard(undefined);
  vi.restoreAllMocks();
});

describe('writeClipboard', () => {
  it('writes the text and resolves true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    expect(await writeClipboard('ocx install')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('ocx install');
  });

  it('resolves false on a refused write, a synchronous throw and a missing clipboard API', async () => {
    clipboard(vi.fn().mockRejectedValue(new Error('denied')));
    expect(await writeClipboard('x')).toBe(false);
    clipboard(() => {
      throw new Error('sync');
    });
    expect(await writeClipboard('x')).toBe(false);
    clipboard(undefined);
    expect(await writeClipboard('x')).toBe(false);
  });
});

describe('toastCopy', () => {
  it('a success is a timed "Copied — meaning" in the copy slot, bubbling from the target', () => {
    const seen = toasts();
    const el = document.body.appendChild(document.createElement('button'));
    toastCopy(el, true, 'install command');
    expect(seen.at(-1)).toEqual({
      title: copiedTitle('install command'),
      duration: COPY_TOAST_MS,
      slot: COPY_TOAST_SLOT,
    });
  });

  it('a failure is the danger "Copy failed" in the same slot, so it replaces a showing confirmation', () => {
    const seen = toasts();
    toastCopy(document.body, false, 'ignored');
    expect(seen.at(-1)).toEqual({ title: 'Copy failed', tone: 'danger', slot: COPY_TOAST_SLOT });
  });
});

describe('copyWithToast', () => {
  it('copies, toasts the outcome and returns it', async () => {
    const seen = toasts();
    clipboard(vi.fn().mockResolvedValue(undefined));
    expect(await copyWithToast(document.body, 'abc', 'value')).toBe(true);
    expect(seen.at(-1)?.['title']).toBe(copiedTitle('value'));
    clipboard(vi.fn().mockRejectedValue(new Error('no')));
    expect(await copyWithToast(document.body, 'abc', 'value')).toBe(false);
    expect(seen.at(-1)?.['title']).toBe('Copy failed');
  });
});
