// @vitest-environment jsdom
// leave() (C-302): a node the script removes is inert and data-leaving, fades and shrinks on
// --ocx-duration-base / --ocx-ease-out through WAAPI, and is removed when that finishes; with the
// token at 0 (reduced motion) it goes at once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leave } from '../src/components/ui/motion.mjs';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const tokens = (duration: string) => {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    const style = real(el);
    const values: Record<string, string> = {
      '--ocx-duration-base': duration,
      '--ocx-ease-out': ' cubic-bezier(0.2, 0, 0, 1)',
    };
    return Object.assign(Object.create(style) as CSSStyleDeclaration, {
      getPropertyValue: (p: string) => values[p] ?? '',
    });
  });
};

const place = () => {
  document.body.innerHTML = '<ul><li id="a">a</li><li id="b">b</li></ul>';
  return document.getElementById('a')!;
};

describe('leave', () => {
  it('a 0 duration removes the node synchronously, without animating', async () => {
    tokens('0s');
    const el = place();
    const animate = vi.fn();
    el.animate = animate;
    const done = leave(el);
    expect(el.isConnected).toBe(false);
    expect(animate).not.toHaveBeenCalled();
    await expect(done).resolves.toBeUndefined();
  });

  it('a nonzero duration marks the node, animates opacity and scale, and removes it on finish', async () => {
    tokens(' 150ms');
    const el = place();
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const animate = vi.fn(() => ({ finished }) as unknown as Animation);
    el.animate = animate;
    const done = leave(el);
    expect(el.inert).toBe(true);
    expect(el.hasAttribute('data-leaving')).toBe(true);
    expect(animate).toHaveBeenCalledWith(
      { opacity: [1, 0], scale: [1, 0.96] },
      { duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    expect(el.isConnected).toBe(true);
    finish();
    await done;
    expect(el.isConnected).toBe(false);
    expect(document.getElementById('b')).not.toBeNull();
  });

  it('parses seconds to ms, and a cancelled animation still removes the node', async () => {
    tokens('0.15s');
    const el = place();
    const animate = vi.fn(() => ({ finished: Promise.reject(new Error('aborted')) }) as unknown as Animation);
    el.animate = animate;
    await leave(el);
    expect(animate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: 150 }));
    expect(el.isConnected).toBe(false);
  });
});
