// @vitest-environment jsdom
// track(): one scroll listener for every tracked element, custom properties written after the reads,
// nothing under reduced motion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let rafs: (() => void)[] = [];
let on: Record<string, () => void> = {};
let add = vi.fn();
const fire = (type: string) => on[type]?.();
const flush = () => {
  const run = rafs;
  rafs = [];
  run.forEach((f) => f());
};
const prop = (el: Element, name: string) => (el as HTMLElement).style.getPropertyValue(name);

async function load(reduce = false) {
  vi.resetModules();
  on = {};
  add = vi.fn((type: string, h: () => void) => void (on[type] = h));
  vi.spyOn(window, 'addEventListener').mockImplementation(add as never);
  vi.stubGlobal('matchMedia', () => ({ matches: reduce }));
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => rafs.push(f));
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('innerWidth', 1000);
  return import('../src/components/ui/scroll.mjs');
}
const rect = (el: Element, top: number, height = 100) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top, height } as DOMRect);

beforeEach(() => {
  rafs = [];
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('track', () => {
  it('draws on the next frame and adds one scroll listener however many elements', async () => {
    const { track } = await load();
    document.body.innerHTML = '<i id="a"></i><i id="b"></i><i id="c"></i>';
    const [a, b, c] = ['a', 'b', 'c'].map((id) => document.getElementById(id)!);
    rect(a!, 100);
    rect(b!, 1000);
    expect(track(a!, 'reveal')).toBe(true);
    track(b!, 'reveal');
    track(c!, 'progress');
    expect(prop(a!, '--ocx-reveal')).toBe('');
    flush();
    expect(prop(a!, '--ocx-reveal')).toBe('1');
    expect(prop(b!, '--ocx-reveal')).toBe('0');
    expect(prop(c!, '--ocx-prog')).toBe('0');
    expect(add.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1);
    expect(rafs).toHaveLength(0);
  });

  it('throttles scroll events to one frame', async () => {
    const { track } = await load();
    document.body.innerHTML = '<i id="a"></i>';
    const a = document.getElementById('a')!;
    track(a, 'progress');
    flush();
    vi.stubGlobal('scrollY', 400);
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 1800 });
    fire('scroll');
    fire('scroll');
    expect(rafs).toHaveLength(1);
    flush();
    expect(prop(a, '--ocx-prog')).toBe('0.4');
  });

  it("measures a reveal without the element's own translation", async () => {
    const { track, revealAt } = await load();
    vi.stubGlobal(
      'DOMMatrix',
      class {
        m42 = 100;
      },
    );
    document.body.innerHTML = '<i id="a"></i>';
    const a = document.getElementById('a')!;
    rect(a, 600);
    track(a, 'reveal');
    flush();
    expect(Number(prop(a, '--ocx-reveal'))).toBeCloseTo(revealAt(500, 800), 9);
  });

  it('fades by scroll offset and writes the rate from the attribute', async () => {
    const { track } = await load();
    document.body.innerHTML = '<i id="a" data-ocx-fade="0.12"></i>';
    const a = document.getElementById('a')!;
    vi.stubGlobal('scrollY', 220);
    track(a, 'fade');
    flush();
    expect(prop(a, '--ocx-fade-k')).toBe('0.12');
    expect(prop(a, '--ocx-fade-y')).toBe('220');
    expect(Number(prop(a, '--ocx-fade-o'))).toBeCloseTo(0.5, 6);
  });

  it('scrubs a stage: items fly in and strike, the finale appears, the pin gets the distance', async () => {
    const { track } = await load();
    document.body.innerHTML =
      '<section id="s"><div data-stage-pin><div data-stage-items><i></i><i></i></div><b data-stage-finale></b></div></section>';
    const s = document.getElementById('s')!;
    rect(s, 54, 1700);
    track(s, 'stage');
    flush();
    expect(prop(s.querySelector('[data-stage-items] > *')!, '--ocx-e')).toBe('0');
    expect(prop(s.querySelector('[data-stage-finale]')!, '--ocx-f')).toBe('0');
    expect(prop(s.querySelector('[data-stage-pin]')!, '--ocx-stage-dist')).toBe('420px');
    rect(s, 54 - 954, 1700);
    fire('scroll');
    flush();
    expect(prop(s.querySelector('[data-stage-items] > *')!, '--ocx-e')).toBe('1');
    expect(prop(s.querySelector('[data-stage-items] > *')!, '--ocx-s')).toBe('1');
    expect(prop(s.querySelector('[data-stage-finale]')!, '--ocx-f')).toBe('1');
  });

  it('drops elements that left the document', async () => {
    const { track } = await load();
    document.body.innerHTML = '<i id="a"></i>';
    const a = document.getElementById('a')!;
    track(a, 'progress');
    flush();
    a.remove();
    a.style.removeProperty('--ocx-prog');
    fire('scroll');
    flush();
    expect(prop(a, '--ocx-prog')).toBe('');
  });

  it('writes a property only when its value changed', async () => {
    const { track } = await load();
    document.body.innerHTML = '<i id="a"></i>';
    const a = document.getElementById('a')!;
    rect(a, 2000);
    const set = vi.spyOn(a.style, 'setProperty');
    track(a, 'reveal');
    flush();
    fire('scroll');
    flush();
    fire('scroll');
    flush();
    expect(set).toHaveBeenCalledTimes(1);
    rect(a, 500);
    fire('scroll');
    flush();
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('keeps tracking a reveal, so it hides again on scroll-up, and reads its translation only after the value moved', async () => {
    const { track } = await load();
    document.body.innerHTML = '<i id="a"></i>';
    const a = document.getElementById('a')!;
    rect(a, 2000);
    const style = vi.spyOn(window, 'getComputedStyle');
    track(a, 'reveal');
    for (let i = 0; i < 5; i++) {
      flush();
      fire('scroll');
    }
    flush();
    expect(style.mock.calls.length).toBeLessThanOrEqual(2); // not one per frame while still
    rect(a, 100);
    fire('scroll');
    flush();
    expect(prop(a, '--ocx-reveal')).toBe('1');
    rect(a, 2000);
    fire('scroll');
    flush();
    expect(prop(a, '--ocx-reveal')).toBe('0');
  });

  it('measures the page height only for a progress bar', async () => {
    const { track } = await load();
    const height = vi.fn(() => 1800);
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: height });
    document.body.innerHTML = '<i id="a"></i><i id="b"></i>';
    const [a, b] = ['a', 'b'].map((id) => document.getElementById(id)!);
    rect(a!, 100);
    track(a!, 'reveal');
    track(b!, 'fade');
    flush();
    expect(height).not.toHaveBeenCalled();
    track(b!, 'progress');
    flush();
    expect(height).toHaveBeenCalledTimes(1);
  });

  it('stops moving a faded-out block', async () => {
    const { track } = await load();
    document.body.innerHTML = '<i id="a"></i>';
    const a = document.getElementById('a')!;
    vi.stubGlobal('scrollY', 900);
    track(a, 'fade');
    flush();
    expect(prop(a, '--ocx-fade-y')).toBe('900');
    vi.stubGlobal('scrollY', 1200);
    fire('scroll');
    flush();
    expect(prop(a, '--ocx-fade-y')).toBe('900');
    expect(prop(a, '--ocx-fade-o')).toBe('0');
  });

  it('does nothing under reduced motion', async () => {
    const { track } = await load(true);
    document.body.innerHTML = '<i id="a"></i>';
    const a = document.getElementById('a')!;
    expect(track(a, 'progress')).toBe(false);
    expect(rafs).toHaveLength(0);
    expect(prop(a, '--ocx-prog')).toBe('');
  });
});
