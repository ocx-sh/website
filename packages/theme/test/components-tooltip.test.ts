// WP13.2 Tooltip: markup contract (Container API) and the tooltip.mjs behaviour
// (jsdom). Replaces the reka-ui/Radix primitive of ocx's Tooltip.vue, so the
// DOC-EX-34 guarantees Radix gave for free are specified here explicitly.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GRACE_MS, initTooltip } from '../src/components/tooltip.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
type Side = 'top' | 'bottom' | 'left' | 'right';
type TooltipProps = { term: string; side?: Side; delayDuration?: number };
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };

const BODY =
  'A SHA-256 content fingerprint. See <a href="https://no-color.org/">no-color.org</a> and <code>__LINKEDIT</code>.';
// HTML phrasing content (the elements the component may emit so it nests in a <p>).
const PHRASING = new Set([
  'A',
  'ABBR',
  'B',
  'BUTTON',
  'CODE',
  'EM',
  'I',
  'KBD',
  'SCRIPT',
  'SPAN',
  'STRONG',
  'SVG',
  'PATH',
  'TEMPLATE',
]);

let container: AstroContainer;
let Tooltip: Component;

beforeAll(async () => {
  container = await AstroContainer.create();
  const name = 'Tooltip'; // a template specifier: tsc has no module type for .astro files
  Tooltip = ((await import(`../src/components/${name}.astro`)) as { default: Component }).default;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const renderHtml = (props: TooltipProps, body = BODY) =>
  container.renderToString(Tooltip, { props, slots: { default: body } });

async function renderDoc(...all: TooltipProps[]): Promise<{ window: Win; doc: Document }> {
  const parts = await Promise.all(all.map((p) => renderHtml(p)));
  const { window } = new JSDOM(
    `<!doctype html><body><p>before ${parts.join(' middle ')} after</p><a id="elsewhere" href="#">x</a></body>`,
  );
  return { window, doc: window.document };
}

const parts = (doc: Document, i = 0) => {
  const root = doc.querySelectorAll<HTMLElement>('[data-ocx-tooltip]')[i];
  const trigger = root?.querySelector('button');
  const id = trigger?.getAttribute('aria-describedby');
  const popup = id ? doc.getElementById(id) : null;
  if (!root || !trigger || !popup) throw new Error(`tooltip ${i}: root, trigger or aria-describedby popup missing`);
  return { root, trigger, popup };
};

describe('WP13.2 Tooltip markup', () => {
  it('WP13.2 Tooltip: trigger is a <button type="button"> whose text is the term (DOC-EX-34)', async () => {
    const { doc } = await renderDoc({ term: 'OCI digest' });
    const button = doc.querySelector('[data-ocx-tooltip] button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.textContent.trim()).toBe('OCI digest');
  });

  it('WP13.2 Tooltip: popup has role="tooltip" and popover="manual", named by the trigger\'s aria-describedby (DOC-EX-34)', async () => {
    const { doc } = await renderDoc({ term: 'OCI digest' });
    const { root, popup } = parts(doc);
    expect(popup.getAttribute('role')).toBe('tooltip');
    expect(popup.getAttribute('popover')).toBe('manual');
    expect(root.contains(popup)).toBe(true);
  });

  it('WP13.2 Tooltip: two tooltips on one page get distinct popup ids', async () => {
    const { doc } = await renderDoc({ term: 'OCI digest' }, { term: 'OCI digest' });
    const ids = [parts(doc, 0).popup.id, parts(doc, 1).popup.id];
    expect(new Set(ids).size).toBe(2);
  });

  it('WP13.2 Tooltip: renders phrasing content only, so it nests inside a <p> without splitting it', async () => {
    const { doc } = await renderDoc({ term: 'OCI digest' });
    expect(doc.querySelectorAll('p')).toHaveLength(1);
    const p = doc.querySelector('p');
    expect(p?.querySelector('[data-ocx-tooltip]')).not.toBeNull();
    expect(p?.textContent).toMatch(/^before .* after$/s);
    const root = parts(doc).root;
    const blocks = [root, ...root.querySelectorAll('*')].map((el) => el.tagName).filter((t) => !PHRASING.has(t));
    expect(blocks).toEqual([]);
  });

  it('WP13.2 Tooltip: default slot is the popup body — rich HTML with links and inline code kept', async () => {
    const { doc } = await renderDoc({ term: 'OCI digest' });
    const { popup } = parts(doc);
    expect(popup.textContent).toContain('A SHA-256 content fingerprint.');
    expect(popup.querySelector('a')?.getAttribute('href')).toBe('https://no-color.org/');
    expect(popup.querySelector('code')?.textContent).toBe('__LINKEDIT');
  });

  it('WP13.2 Tooltip: side defaults to "top"', async () => {
    const { doc } = await renderDoc({ term: 'OCI digest' });
    expect(parts(doc).popup.dataset['side']).toBe('top');
  });

  it.each<Side>(['top', 'bottom', 'left', 'right'])(
    'WP13.2 Tooltip: side="%s" lands on the popup as data-side',
    async (side) => {
      const { doc } = await renderDoc({ term: 'OCI digest', side });
      expect(parts(doc).popup.dataset['side']).toBe(side);
    },
  );

  it('WP13.2 Tooltip: delayDuration defaults to 400 and is passed as data-delay; an explicit value overrides it', async () => {
    const { doc } = await renderDoc({ term: 'a' }, { term: 'b', delayDuration: 0 });
    expect(parts(doc, 0).root.dataset['delay']).toBe('400');
    expect(parts(doc, 1).root.dataset['delay']).toBe('0');
  });
});

describe('WP13.2 Tooltip behaviour (tooltip.mjs)', () => {
  // jsdom has no Popover API: each popup gets a show/hide/toggle stub that
  // tracks state, and `:popover-open` answers from that state.
  async function setup(...all: TooltipProps[]) {
    vi.useFakeTimers();
    const { window, doc } = await renderDoc(...all);
    for (const name of ['window', 'document', 'Element', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent'] as const)
      vi.stubGlobal(name, name === 'window' ? window : name === 'document' ? doc : window[name]);
    const tips = all.map((_, i) => {
      const t = parts(doc, i);
      let open = false;
      const matches = t.popup.matches.bind(t.popup);
      Object.assign(t.popup, {
        showPopover: vi.fn(() => void (open = true)),
        hidePopover: vi.fn(() => void (open = false)),
        togglePopover: vi.fn((force?: boolean) => (open = force ?? !open)),
        matches: (s: string) => (s === ':popover-open' ? open : matches(s)),
      });
      return { ...t, isOpen: () => open };
    });
    for (const t of tips) initTooltip(t.root);
    const elsewhere = doc.getElementById('elsewhere') as HTMLElement;
    // What a browser fires when the pointer crosses from `from` to `to`.
    const move = (from: Element | null, to: Element | null) => {
      const init = { relatedTarget: to, bubbles: true };
      if (from) {
        from.dispatchEvent(new window.PointerEvent('pointerout', init));
        from.dispatchEvent(new window.PointerEvent('pointerleave', { relatedTarget: to }));
        from.dispatchEvent(new window.MouseEvent('mouseout', init));
        from.dispatchEvent(new window.MouseEvent('mouseleave', { relatedTarget: to }));
      }
      if (to) {
        const back = { relatedTarget: from, bubbles: true };
        to.dispatchEvent(new window.PointerEvent('pointerover', back));
        to.dispatchEvent(new window.PointerEvent('pointerenter', { relatedTarget: from }));
        to.dispatchEvent(new window.MouseEvent('mouseover', back));
        to.dispatchEvent(new window.MouseEvent('mouseenter', { relatedTarget: from }));
      }
    };
    const escape = (target: EventTarget) =>
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    return { doc, tips, elsewhere, move, escape };
  }

  async function hoverOpen(...all: TooltipProps[]) {
    const s = await setup(...all);
    const t = s.tips[0]!;
    s.move(s.elsewhere, t.trigger);
    vi.advanceTimersByTime(all[0]?.delayDuration ?? 400);
    expect(t.isOpen()).toBe(true);
    return { ...s, t };
  }

  it('WP13.2 Tooltip: keyboard focus opens the popup at once, no hover delay (DOC-EX-34)', async () => {
    const { tips } = await setup({ term: 'OCI digest' });
    tips[0]!.trigger.focus();
    expect(tips[0]!.isOpen()).toBe(true);
  });

  it('WP13.2 Tooltip: hover opens only after delayDuration, not before (DOC-EX-34, reka delayDuration=400)', async () => {
    const { tips, move, elsewhere } = await setup({ term: 'OCI digest' });
    move(elsewhere, tips[0]!.trigger);
    vi.advanceTimersByTime(399);
    expect(tips[0]!.isOpen()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(tips[0]!.isOpen()).toBe(true);
  });

  it('WP13.2 Tooltip: delayDuration={0} opens on hover without waiting', async () => {
    const { tips, move, elsewhere } = await setup({ term: 'ANSI colors', delayDuration: 0 });
    move(elsewhere, tips[0]!.trigger);
    vi.advanceTimersByTime(0);
    expect(tips[0]!.isOpen()).toBe(true);
  });

  it('WP13.2 Tooltip: pointer leaving the trigger before the delay cancels the open', async () => {
    const { tips, move, elsewhere } = await setup({ term: 'OCI digest' });
    move(elsewhere, tips[0]!.trigger);
    vi.advanceTimersByTime(200);
    move(tips[0]!.trigger, elsewhere);
    vi.advanceTimersByTime(1000);
    expect(tips[0]!.isOpen()).toBe(false);
  });

  it('WP13.2 Tooltip: moving the pointer from the trigger onto the popup keeps it open (DOC-EX-34 grace period)', async () => {
    const { t, move } = await hoverOpen({ term: 'cross-tool convention' });
    move(t.trigger, t.popup);
    vi.advanceTimersByTime(GRACE_MS * 10);
    expect(t.isOpen()).toBe(true);
  });

  it('WP13.2 Tooltip: pointer leaving the trigger for elsewhere closes it after the grace period', async () => {
    const { t, move, elsewhere } = await hoverOpen({ term: 'OCI digest' });
    move(t.trigger, elsewhere);
    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(t.isOpen()).toBe(false);
  });

  it('WP13.2 Tooltip: pointer leaving the popup closes it', async () => {
    const { t, move, elsewhere } = await hoverOpen({ term: 'cross-tool convention' });
    move(t.trigger, t.popup);
    vi.advanceTimersByTime(GRACE_MS * 2);
    move(t.popup, elsewhere);
    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(t.isOpen()).toBe(false);
  });

  it('WP13.2 Tooltip: Escape closes it and focus stays on the trigger (DOC-EX-34)', async () => {
    const { doc, tips, escape } = await setup({ term: 'OCI digest' });
    const t = tips[0]!;
    t.trigger.focus();
    expect(t.isOpen()).toBe(true);
    escape(t.trigger);
    expect(t.isOpen()).toBe(false);
    expect(doc.activeElement).toBe(t.trigger);
  });

  it('WP13.2 Tooltip: Escape closes a hover-opened tooltip while focus is elsewhere (DOC-EX-34)', async () => {
    const { doc, t, escape } = await hoverOpen({ term: 'OCI digest' });
    escape(doc.body);
    expect(t.isOpen()).toBe(false);
  });

  it('WP13.2 Tooltip: focus moving from the trigger into a link in the popup keeps it open; leaving both closes it', async () => {
    const { tips, elsewhere } = await setup({ term: 'cross-tool convention' });
    const t = tips[0]!;
    t.trigger.focus();
    t.popup.querySelector('a')!.focus();
    vi.advanceTimersByTime(GRACE_MS * 10);
    expect(t.isOpen()).toBe(true);
    elsewhere.focus();
    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(t.isOpen()).toBe(false);
  });

  it('WP13.2 Tooltip: Escape from a link inside the popup closes it and returns focus to the trigger (DOC-EX-34)', async () => {
    const { doc, tips, escape } = await setup({ term: 'cross-tool convention' });
    const t = tips[0]!;
    t.trigger.focus();
    const link = t.popup.querySelector('a')!;
    link.focus();
    escape(link);
    expect(t.isOpen()).toBe(false);
    expect(doc.activeElement).toBe(t.trigger);
  });

  it('WP13.2 Tooltip: blur closes it (DOC-EX-34)', async () => {
    const { tips } = await setup({ term: 'OCI digest' });
    const t = tips[0]!;
    t.trigger.focus();
    t.trigger.blur();
    vi.advanceTimersByTime(GRACE_MS + 1);
    expect(t.isOpen()).toBe(false);
  });

  it('WP13.2 Tooltip: a tap/click focuses the trigger and opens it (WebKit/iOS does not focus a <button> on tap)', async () => {
    const { doc, tips } = await setup({ term: 'OCI digest' });
    const t = tips[0]!;
    t.trigger.click();
    expect(doc.activeElement).toBe(t.trigger);
    expect(t.isOpen()).toBe(true);
  });

  it('WP13.2 Tooltip: pointer leaving does not close it while focus is inside (WCAG 1.4.13 persistent)', async () => {
    const { tips, move, elsewhere } = await setup({ term: 'OCI digest' });
    const t = tips[0]!;
    t.trigger.focus();
    move(elsewhere, t.trigger);
    move(t.trigger, elsewhere);
    vi.advanceTimersByTime(GRACE_MS * 10);
    expect(t.isOpen()).toBe(true);
    elsewhere.focus();
    expect(t.isOpen()).toBe(false);
  });

  it('WP13.2 Tooltip: scrolling closes a hover-opened tooltip and drops the scroll listener (Radix; side is measured at open)', async () => {
    const { doc, t } = await hoverOpen({ term: 'OCI digest' });
    const remove = vi.spyOn(doc, 'removeEventListener');
    doc.body.dispatchEvent(new window.Event('scroll'));
    expect(t.isOpen()).toBe(false);
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), expect.objectContaining({ capture: true }));
  });

  it('WP13.2 Tooltip: scrolling keeps a focus-opened tooltip open (Tab scrolls the trigger into view)', async () => {
    const { doc, tips } = await setup({ term: 'OCI digest' });
    const t = tips[0]!;
    t.trigger.focus();
    doc.dispatchEvent(new window.Event('scroll'));
    expect(t.isOpen()).toBe(true);
  });

  it('WP13.2 Tooltip: only one tooltip is open at a time — opening a second closes the first', async () => {
    const { tips, move, elsewhere } = await setup({ term: 'OCI digest' }, { term: 'code signature' });
    const [a, b] = [tips[0]!, tips[1]!];
    a.trigger.focus();
    expect(a.isOpen()).toBe(true);
    move(elsewhere, b.trigger);
    vi.advanceTimersByTime(400);
    expect(b.isOpen()).toBe(true);
    expect(a.isOpen()).toBe(false);
  });
});
