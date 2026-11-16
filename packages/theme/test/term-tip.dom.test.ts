// @vitest-environment jsdom
// The glossary popup (components/term-tip.mjs) on a fixture DOM: focus and hover opening, the hoverable and
// dismissible popup (WCAG 1.4.13), one popup at a time, the aria wiring, and a plain link when the data fails.
// The popup's placement and animation are CSS, proved in a browser by tests/e2e/components-glossary.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRACE_MS as TIP_GRACE_MS, HOVER_MS, reset, start } from '../src/components/term-tip.mjs';
import { watch } from '../src/components/term-touch.mjs';
import { GRACE_MS } from '../src/components/tooltip.mjs';

it('keeps the grace period of the Tooltip it is not bundled with', () => {
  expect(TIP_GRACE_MS).toBe(GRACE_MS);
});

const DEFS = {
  alpha: ['Alpha', 'The first `letter`.'],
  beta: ['Beta', 'The second.'],
};
const URL_ = '/docs/glossary.json';

const tip = () => document.getElementById('ocx-term-tip');
const open = () => tip()?.dataset['open'] === '';
const alpha = () => document.querySelector<HTMLAnchorElement>('a[href$="#alpha"]')!;
const beta = () => document.querySelector<HTMLAnchorElement>('a[href$="#beta"]')!;

function fire(target: EventTarget, type: string, init: { related?: EventTarget | null; pointer?: string } = {}) {
  const e = new MouseEvent(type, { bubbles: true, relatedTarget: init.related ?? null });
  Object.defineProperty(e, 'pointerType', { value: init.pointer ?? 'mouse' });
  target.dispatchEvent(e);
  return e;
}
const focusin = (el: HTMLElement) => {
  el.focus();
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
};
const focusout = (el: Element, related: Element | null = null) =>
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: related }));
const settle = () => vi.advanceTimersByTimeAsync(0);

let fetchMock: ReturnType<typeof vi.fn>;
// Every start() adds listeners to the one document; each test stops its own.
const stops: (() => void)[] = [];
const begun = (...args: Parameters<typeof start>) => {
  const stop = start(...args);
  stops.push(stop);
  return stop;
};

beforeEach(() => {
  vi.useFakeTimers();
  reset();
  document.head.innerHTML = '';
  document.body.innerHTML =
    '<p>The <a class="ocx-term" href="/docs/g/#alpha">alpha</a>, a <a class="ocx-term" href="/docs/g/#beta">beta</a> and ' +
    '<a class="ocx-term" href="/docs/g/#missing">missing</a>. <button id="other">other</button></p>';
  // jsdom has no Popover API: open state is a data attribute the test reads.
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      this.dataset['open'] = '';
    },
    hidePopover(this: HTMLElement) {
      delete this.dataset['open'];
    },
  });
  fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(DEFS) }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Each test starts the popup the way term-touch.mjs does, on its first event; the listeners then run on the document.
async function begin() {
  begun(document, undefined, { url: URL_ });
  await settle();
}

describe('opening', () => {
  it('focus opens the popup at once: no timer, the term and its definition inside', async () => {
    await begin();
    focusin(alpha());
    await settle();
    expect(open()).toBe(true);
    expect(tip()?.getAttribute('role')).toBe('tooltip');
    expect(tip()?.getAttribute('popover')).toBe('manual');
    expect(tip()?.querySelector('strong')?.textContent).toBe('Alpha');
    expect(tip()?.textContent).toBe('AlphaThe first letter.');
    expect(tip()?.querySelector('code')?.textContent).toBe('letter');
    expect(fetchMock).toHaveBeenCalledWith(URL_, expect.anything());
  });

  it(`hover opens it only after ${HOVER_MS} ms`, async () => {
    await begin();
    fire(alpha(), 'pointerover');
    await vi.advanceTimersByTimeAsync(HOVER_MS - 1);
    expect(tip()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(open()).toBe(true);
  });

  it('fetches the data once for any number of opens', async () => {
    await begin();
    focusin(alpha());
    await settle();
    focusin(beta());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('touch pointer events do not open it: a tap follows the link', async () => {
    await begin();
    fire(alpha(), 'pointerover', { pointer: 'touch' });
    await vi.advanceTimersByTimeAsync(HOVER_MS * 2);
    expect(tip()).toBeNull();
  });

  it('acts on the event that loaded the module: a hover or a focus', async () => {
    begun(document, fire(alpha(), 'pointerover'), { url: URL_ });
    await vi.advanceTimersByTimeAsync(HOVER_MS);
    expect(open()).toBe(true);
    reset();
    document.getElementById('ocx-term-tip')?.remove();
  });

  it('does not open for a visitor who left before the data arrived', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await begin();
    focusin(alpha());
    focusout(alpha());
    resolve({ ok: true, json: () => Promise.resolve(DEFS) });
    await settle();
    expect(tip()).toBeNull();
  });
});

describe('closing and hovering (WCAG 1.4.13)', () => {
  it('Escape closes it and focus stays on the term (dismissible)', async () => {
    await begin();
    focusin(alpha());
    await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(open()).toBe(false);
    expect(document.activeElement).toBe(alpha());
  });

  it('Escape closes a popup that hover opened, and one still waiting to open', async () => {
    await begin();
    fire(alpha(), 'pointerover');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.advanceTimersByTimeAsync(HOVER_MS * 2);
    expect(tip()).toBeNull();
  });

  it('blur closes it', async () => {
    await begin();
    focusin(alpha());
    await settle();
    focusout(alpha(), document.getElementById('other'));
    expect(open()).toBe(false);
  });

  it('the pointer leaving closes it after the grace period, not before', async () => {
    await begin();
    fire(alpha(), 'pointerover');
    await vi.advanceTimersByTimeAsync(HOVER_MS);
    fire(alpha(), 'pointerout', { related: document.body });
    await vi.advanceTimersByTimeAsync(GRACE_MS - 1);
    expect(open()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(open()).toBe(false);
  });

  it('the pointer can move onto the popup and it stays open (hoverable), then closes when it leaves', async () => {
    await begin();
    fire(alpha(), 'pointerover');
    await vi.advanceTimersByTimeAsync(HOVER_MS);
    fire(alpha(), 'pointerout', { related: document.body });
    await vi.advanceTimersByTimeAsync(GRACE_MS / 2);
    fire(tip()!, 'pointerover', { related: document.body });
    await vi.advanceTimersByTimeAsync(GRACE_MS * 5);
    expect(open()).toBe(true);
    fire(tip()!, 'pointerout', { related: document.body });
    await vi.advanceTimersByTimeAsync(GRACE_MS);
    expect(open()).toBe(false);
  });

  it('a focused term keeps its popup when the pointer leaves (persistent)', async () => {
    await begin();
    focusin(alpha());
    await settle();
    fire(alpha(), 'pointerover');
    fire(alpha(), 'pointerout', { related: document.body });
    await vi.advanceTimersByTimeAsync(GRACE_MS * 5);
    expect(open()).toBe(true);
  });

  it('a hover-opened popup closes on scroll, a focused one does not', async () => {
    await begin();
    fire(alpha(), 'pointerover');
    await vi.advanceTimersByTimeAsync(HOVER_MS);
    document.dispatchEvent(new Event('scroll'));
    expect(open()).toBe(false);
    focusin(beta());
    await settle();
    document.dispatchEvent(new Event('scroll'));
    expect(open()).toBe(true);
  });
});

describe('one popup, the aria wiring', () => {
  it('only one popup element, and opening another term closes the first', async () => {
    await begin();
    focusin(alpha());
    await settle();
    focusin(beta());
    await settle();
    expect(document.querySelectorAll('#ocx-term-tip')).toHaveLength(1);
    expect(tip()?.querySelector('strong')?.textContent).toBe('Beta');
    expect(alpha().hasAttribute('aria-describedby')).toBe(false);
    expect(beta().getAttribute('aria-describedby')).toBe('ocx-term-tip');
  });

  it('hovering a second term while the first is open moves the popup and the description', async () => {
    await begin();
    fire(alpha(), 'pointerover');
    await vi.advanceTimersByTimeAsync(HOVER_MS * 2);
    expect(tip()?.querySelector('strong')?.textContent).toBe('Alpha');
    fire(beta(), 'pointerover', { related: alpha() });
    await vi.advanceTimersByTimeAsync(HOVER_MS * 2);
    expect(tip()?.querySelector('strong')?.textContent).toBe('Beta');
    expect(alpha().hasAttribute('aria-describedby')).toBe(false);
    expect(beta().getAttribute('aria-describedby')).toBe('ocx-term-tip');
  });

  it('aria-describedby is on the term only while the popup is open', async () => {
    await begin();
    expect(alpha().hasAttribute('aria-describedby')).toBe(false);
    focusin(alpha());
    await settle();
    expect(alpha().getAttribute('aria-describedby')).toBe('ocx-term-tip');
    expect(alpha().style.getPropertyValue('anchor-name')).toBe('--ocx-term-tip');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(alpha().hasAttribute('aria-describedby')).toBe(false);
    expect(alpha().style.getPropertyValue('anchor-name')).toBe('');
  });

  it('the popup holds nothing interactive', async () => {
    await begin();
    focusin(alpha());
    await settle();
    expect(tip()?.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('adds its sheet to the head once, on the first open', async () => {
    await begin();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    focusin(alpha());
    await settle();
    focusin(beta());
    await settle();
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
  });
});

describe('failure leaves the plain link', () => {
  it('a rejected fetch, a bad status and bad JSON show nothing and throw nothing', async () => {
    for (const failing of [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve({ ok: false, json: () => Promise.resolve(DEFS) }),
      () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('bad')) }),
    ]) {
      reset();
      fetchMock.mockImplementationOnce(failing as () => unknown);
      begun(document, undefined, { url: URL_ });
      const before = alpha().outerHTML;
      focusin(alpha());
      await vi.advanceTimersByTimeAsync(HOVER_MS);
      expect(tip()).toBeNull();
      expect(alpha().outerHTML).toBe(before);
    }
  });

  it('a term with no definition in the data shows nothing', async () => {
    await begin();
    focusin(document.querySelector<HTMLElement>('a[href$="#missing"]')!);
    await settle();
    expect(tip()).toBeNull();
  });
});

describe('the delegator in term-touch.mjs', () => {
  it('loads nothing until a term is touched, then loads the popup once and stops listening', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    watch(document);
    expect(add.mock.calls.filter(([type]) => type === 'pointerover' || type === 'focusin')).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
    fire(document.getElementById('other')!, 'pointerover');
    expect(remove).not.toHaveBeenCalled();
    fire(alpha(), 'pointerover');
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    add.mockRestore();
    remove.mockRestore();
  });
});
