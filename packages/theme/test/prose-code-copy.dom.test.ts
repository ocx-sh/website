// @vitest-environment jsdom
// Prose "Copy code" (D-064, D-112) under a DOM: a button on every pre in prose, one delegated click,
// "Copied — code block". Each test enhances a document of its own: the click listener outlives it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhanceProseCode } from '../src/components/prose-code-copy.mjs';

// The first click imports copy.mjs (D-064): nothing here imports it ahead, so the real lazy path
// runs. The import settles on real I/O; waitFor polls it (and steps the fake copied-window timers).
const settled = (assertion: () => void) => vi.waitFor(assertion, { timeout: 5000, interval: 5 });
const fakeWindow = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

function page(html: string) {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;
  const seen: unknown[] = [];
  doc.addEventListener('ocx:toast', (e) => seen.push((e as CustomEvent).detail));
  enhanceProseCode(doc);
  return { doc, seen, buttons: () => [...doc.querySelectorAll<HTMLButtonElement>('pre > button')] };
}

const README = `<div class="ocx-prose"><pre id="a"><code>ocx add astral-sh/uv:0.10
ocx install uv
</code></pre><p>text</p><pre id="b"><code>second</code></pre></div>`;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('prefetch listeners', () => {
  it('are removed once the first prefetch has loaded', async () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = README;
    const removed: string[] = [];
    const orig = doc.removeEventListener.bind(doc);
    doc.removeEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject]) => {
      removed.push(type);
      return orig(type, ...rest);
    }) as typeof doc.removeEventListener;
    enhanceProseCode(doc);
    doc.querySelector('pre > button')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await settled(() => expect(removed.sort()).toEqual(['focusin', 'pointerover']));
  });
});

describe('D-064 D-112 a Copy code button on every prose block', () => {
  it('D-064 one button per pre inside .ocx-prose (README), a real labelled button, no inline handler', () => {
    const { buttons } = page(README);
    expect(buttons()).toHaveLength(2);
    for (const b of buttons()) {
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-label')).toBe('Copy code');
      expect(b.title).toBe('Copy code');
      expect(b.hasAttribute('onclick')).toBe(false);
      expect(b.parentElement?.hasAttribute('data-ocx-code-copy')).toBe(true);
    }
  });

  it('D-112 the docs content roots get it too (.sl-markdown-content, .vp-doc)', () => {
    const { buttons } = page(
      '<div class="sl-markdown-content"><pre><code>a</code></pre></div><div class="vp-doc"><pre><code>b</code></pre></div>',
    );
    expect(buttons()).toHaveLength(2);
  });

  it('D-064 a pre outside prose and an Expressive Code frame get none', () => {
    const { buttons } = page(
      `<pre><code>outside</code></pre>
       <div class="ocx-prose"><div class="expressive-code"><pre><code>framed</code></pre></div></div>`,
    );
    expect(buttons()).toHaveLength(0);
  });

  it('D-064 the button does not change what the block reads as (no text in it)', () => {
    const { doc } = page('<div class="ocx-prose"><pre id="a"><code>x</code></pre></div>');
    expect(doc.getElementById('a')?.textContent).toBe('x');
  });
});

describe('D-064 D-112 D-131 D-143 copying', () => {
  it('D-064 D-131 D-143 copies the code, toasts "Copied — code block" for 2 s, and reads copied for 1.5 s', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    fakeWindow();
    const { buttons, seen } = page(README);
    const [first] = buttons();
    first!.click(); // the very first click: nothing was prefetched, it awaits the lazy import
    await settled(() => expect(first!.hasAttribute('data-copied')).toBe(true));
    expect(writeText).toHaveBeenCalledWith('ocx add astral-sh/uv:0.10\nocx install uv'); // no trailing newline
    expect(seen).toEqual([{ title: 'Copied — code block', duration: 2000, slot: 'copy' }]);
    expect(first!.hasAttribute('data-copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(1400);
    expect(first!.hasAttribute('data-copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(first!.hasAttribute('data-copied')).toBe(false);
  });

  it('D-064 each block copies its own code', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { buttons } = page(README);
    buttons()[1]!.click();
    await settled(() => expect(writeText).toHaveBeenLastCalledWith('second'));
  });

  it('D-064 a pre without a code child copies its own text, the button excluded', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { buttons } = page('<div class="ocx-prose"><pre>plain text</pre></div>');
    buttons()[0]!.click();
    await settled(() => expect(writeText).toHaveBeenCalledWith('plain text'));
  });

  it('D-166 a second copy 1 s into the copied window keeps it copied for a full new window', async () => {
    fakeWindow();
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    const { buttons, seen } = page(README);
    const [b] = buttons();
    b!.click();
    await settled(() => expect(b!.hasAttribute('data-copied')).toBe(true));
    await vi.advanceTimersByTimeAsync(1000);
    b!.click();
    await settled(() => expect(seen).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(1000); // 2 s: the first window is long over
    expect(b!.hasAttribute('data-copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(b!.hasAttribute('data-copied')).toBe(false);
  });

  it('D-084 no clipboard API: "Copy failed", no copied state, nothing thrown', async () => {
    vi.stubGlobal('navigator', {});
    const { buttons, seen } = page(README);
    buttons()[0]!.click();
    await settled(() => expect(seen).toEqual([{ title: 'Copy failed', tone: 'danger', slot: 'copy' }]));
    expect(buttons()[0]!.hasAttribute('data-copied')).toBe(false);
  });

  it('D-064 a click anywhere else in prose copies nothing', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { doc, seen } = page(README);
    doc.querySelector('p')!.click();
    doc.querySelector('pre')!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeText).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('D-064 a hover over a block or focus on its button only loads the copy code ahead of the click: nothing is copied', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { doc, buttons, seen } = page(README);
    doc.querySelector('pre')!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    buttons()[0]!.dispatchEvent(new Event('focusin', { bubbles: true }));
    doc.querySelector('p')!.dispatchEvent(new Event('pointerover', { bubbles: true })); // not a block
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(writeText).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });
});
