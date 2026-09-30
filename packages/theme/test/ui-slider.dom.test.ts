// @vitest-environment jsdom
// C-270 Slider behaviour in jsdom: readDom reads the hidden inputs and the format, the callbacks
// surface as ocx:slider:input / ocx:slider:change in the shape of the `value` prop, and a started
// machine drives the parts (value text, hidden inputs, aria) from the keyboard.
import { afterEach, describe, expect, it } from 'vitest';
import * as mod from '../src/components/ui/slider.zag.mjs';
import { run } from '../src/components/ui/zag-runtime.mjs';

afterEach(() => {
  document.body.innerHTML = '';
});

/** The SSR anatomy, reduced to what `render` and `readDom` look for. */
function place(values: number[], attrs: Record<string, string> = {}, props: Record<string, unknown> = {}) {
  const thumbs = values.map((v) => `<div data-part="thumb"><input type="text" hidden value="${v}"></div>`).join('');
  const attr = Object.entries({ 'data-zag-root': 'slider', 'data-zag-id': 's1', ...attrs })
    .map(([k, v]) => `${k}='${v}'`)
    .join(' ');
  document.body.innerHTML = `<div id="root" ${attr}>
    <label data-part="label">Volume</label><span data-part="value-text">stale</span>
    <div data-part="control"><div data-part="track"><div data-part="range"></div></div>${thumbs}</div>
  </div>`;
  const root = document.getElementById('root') as HTMLElement;
  const events: [string, unknown][] = [];
  for (const name of ['input', 'change'])
    root.addEventListener(`ocx:slider:${name}`, (e) => events.push([name, (e as CustomEvent).detail]));
  const own = { min: 0, max: 100, step: 1, thumbAlignment: 'center', ...props };
  return { root, events, own };
}

describe('C-270 readDom', () => {
  it('reads the hidden inputs as the initial value, one per thumb', () => {
    const { root } = place([20, 80]);
    expect(mod.readDom(root, () => {})).toMatchObject({ defaultValue: [20, 80] });
  });

  it('a changed hidden input (form restore) wins over the SSR value', () => {
    const { root } = place([20]);
    (root.querySelector('input') as HTMLInputElement).value = '35';
    expect(mod.readDom(root, () => {})).toMatchObject({ defaultValue: [35] });
  });

  it('builds getAriaValueText from the root format, and only then', () => {
    const plain = place([1]);
    expect(mod.readDom(plain.root, () => {})).not.toHaveProperty('getAriaValueText');
    const fmt = place([1], {
      'data-ocx-format': JSON.stringify({ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    });
    const read = mod.readDom(fmt.root, () => {}) as {
      getAriaValueText: (d: { value: number; index: number }) => string;
    };
    expect(read.getAriaValueText({ value: 1250, index: 0 })).toBe('$1,250');
  });

  it('emits the value in the shape of the prop: a number for one thumb, an array for a range', () => {
    const one = place([10]);
    const oneRead = mod.readDom(one.root, () => {}) as Record<string, (d: { value: number[] }) => void>;
    oneRead['onValueChange']?.({ value: [12] });
    oneRead['onValueChangeEnd']?.({ value: [12] });
    expect(one.events).toEqual([
      ['input', { value: 12 }],
      ['change', { value: 12 }],
    ]);
    const two = place([10, 90]);
    const twoRead = mod.readDom(two.root, () => {}) as Record<string, (d: { value: number[] }) => void>;
    twoRead['onValueChange']?.({ value: [15, 90] });
    twoRead['onValueChangeEnd']?.({ value: [15, 90] });
    expect(two.events).toEqual([
      ['input', { value: [15, 90] }],
      ['change', { value: [15, 90] }],
    ]);
  });
});

describe('C-270 a started machine', () => {
  // The machine and its subscribers settle after a tick.
  const key = async (el: Element, k: string) => {
    // The machine acts on keys once its thumb has focus (a Tab or a click puts it there).
    if (document.activeElement !== el) (el as HTMLElement).focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('an arrow key steps the value: aria, hidden input, value text and both events follow', async () => {
    const { root, events, own } = place([40]);
    const session = run(root, mod, own);
    try {
      const thumb = root.querySelector('[data-part="thumb"]') as HTMLElement;
      const input = root.querySelector('input') as HTMLInputElement;
      expect(root.querySelector('[data-part="value-text"]')?.textContent).toBe('40');
      await key(thumb, 'ArrowRight');
      expect(thumb.getAttribute('aria-valuenow')).toBe('41');
      expect(input.value).toBe('41');
      expect(root.querySelector('[data-part="value-text"]')?.textContent).toBe('41');
      // PageUp takes the large step (10 x step) and lands on a multiple of it.
      await key(thumb, 'PageUp');
      expect(thumb.getAttribute('aria-valuenow')).toBe('50');
      await key(thumb, 'Home');
      expect(thumb.getAttribute('aria-valuenow')).toBe('0');
      await key(thumb, 'End');
      expect(thumb.getAttribute('aria-valuenow')).toBe('100');
      expect(events.map(([name]) => name)).toContain('input');
      expect(events.at(-1)).toEqual(['change', { value: 100 }]);
      // Every key step ends a change: input and change come in pairs.
      expect(events.filter(([n]) => n === 'input')).toHaveLength(events.filter(([n]) => n === 'change').length);
    } finally {
      session.stop();
    }
  });

  it('range thumbs cannot cross: the first stops at the second', async () => {
    const { root, own } = place([50, 52]);
    const session = run(root, mod, { ...own, 'aria-label': ['Min', 'Max'] });
    try {
      const [a, b] = [...root.querySelectorAll<HTMLElement>('[data-part="thumb"]')];
      await key(a as HTMLElement, 'End');
      expect(a?.getAttribute('aria-valuenow')).toBe('52');
      expect(b?.getAttribute('aria-valuenow')).toBe('52');
      expect(root.querySelector('[data-part="value-text"]')?.textContent).toBe('52 – 52');
    } finally {
      session.stop();
    }
  });

  it('the value text follows the format', async () => {
    const format = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 };
    const { root, own } = place([40], { 'data-ocx-format': JSON.stringify(format) });
    const session = run(root, mod, own);
    try {
      await key(root.querySelector('[data-part="thumb"]') as Element, 'ArrowRight');
      expect(root.querySelector('[data-part="value-text"]')?.textContent).toBe('$41');
      expect(root.querySelector('[data-part="thumb"]')?.getAttribute('aria-valuetext')).toBe('$41');
    } finally {
      session.stop();
    }
  });

  it('stop() removes what it spread: no listeners left to step the value', async () => {
    const { root, own } = place([40]);
    const session = run(root, mod, own);
    const thumb = root.querySelector('[data-part="thumb"]') as HTMLElement;
    session.stop();
    await key(thumb, 'ArrowRight');
    expect(thumb.getAttribute('aria-valuenow')).not.toBe('41');
  });

  it('a disabled slider disables its hidden field, so a form never submits it', () => {
    const { root, own } = place([40], {}, { disabled: true });
    const session = run(root, mod, own);
    try {
      expect((root.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    } finally {
      session.stop();
    }
  });
});
