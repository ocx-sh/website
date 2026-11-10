// WP13.4 FeatureSection: port of ocx FeatureSection.vue (16954ea87) with the
// one-shot IntersectionObserver reveal of ocx 43d3f2dc9 (RoadmapItem.vue).
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { revealOnIntersect } from '../src/components/feature-section.mjs';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const FeatureSection = ((await import(`../src/components/${'FeatureSection'}.astro`)) as { default: Component })
  .default;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function render(
  props: { title: string; flip?: boolean; eyebrow?: string; reveal?: boolean },
  extra: Record<string, string> = {},
): Promise<Document> {
  const html = await container.renderToString(FeatureSection, {
    props,
    slots: {
      default: '<pre class="visual">ocx add astral-sh/uv:0.10</pre>',
      text: '<p class="body">Body text.</p>',
      ...extra,
    },
  });
  return new JSDOM(html).window.document;
}

describe('WP13.4 FeatureSection markup', () => {
  it('WP13.4 FeatureSection: title is an <h2>, `text` slot in the body, default slot in the visual (16954ea87)', async () => {
    const doc = await render({ title: 'Composable Environments' });
    const section = doc.querySelector('section.ocx-feature');
    expect(section?.querySelector('.ocx-feature__text h2')?.textContent.trim()).toBe('Composable Environments');
    expect(section?.querySelector('.ocx-feature__body p.body')?.textContent).toBe('Body text.');
    expect(section?.querySelector('.ocx-feature__visual pre.visual')).not.toBeNull();
  });

  it('WP13.4 FeatureSection: `flip` sets data-flip; without it the attribute is absent (16954ea87)', async () => {
    expect((await render({ title: 'A', flip: true })).querySelector('.ocx-feature')?.hasAttribute('data-flip')).toBe(
      true,
    );
    expect((await render({ title: 'A' })).querySelector('.ocx-feature')?.hasAttribute('data-flip')).toBe(false);
  });

  it('WP13.4 FeatureSection: DOM order is text then visual even when flipped (flip is visual-only, reading order stable)', async () => {
    for (const flip of [false, true]) {
      const section = (await render({ title: 'A', flip })).querySelector('.ocx-feature');
      expect([...(section?.children ?? [])].map((c) => c.className.split(' ')[0])).toEqual([
        'ocx-feature__text',
        'ocx-feature__visual',
      ]);
    }
  });

  it('WP13.4 FeatureSection: server HTML is never pre-revealed (the client IO callback sets data-revealed) (43d3f2dc9)', async () => {
    expect((await render({ title: 'A' })).querySelector('.ocx-feature')?.hasAttribute('data-revealed')).toBe(false);
  });

  it('WP13.4 FeatureSection: hide-before-reveal CSS is gated on (scripting: enabled) and (prefers-reduced-motion: no-preference), inside @layer ocx (43d3f2dc9)', () => {
    const src = readFileSync(new URL('../src/components/FeatureSection.astro', import.meta.url), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(src)?.[1] ?? '';
    expect(style).toMatch(/@layer ocx\s*\{/);
    expect(style).toMatch(/@media \(scripting: enabled\) and \(prefers-reduced-motion: no-preference\)/);
    // ponytail: that no-JS / reduced-motion readers see the content is proven in the e2e spec, not by parsing CSS.
  });
});

describe('FeatureSection eyebrow, more and reveal', () => {
  it('puts the eyebrow above the heading, and renders none without it', async () => {
    const text = (await render({ title: 'A', eyebrow: '01 · one lock' })).querySelector('.ocx-feature__text');
    expect([...(text?.children ?? [])].map((c) => c.className.split(' ')[0])).toEqual([
      'ocx-feature__eyebrow',
      'ocx-feature__title',
      'ocx-feature__body',
    ]);
    expect(text?.querySelector('.ocx-feature__eyebrow')?.textContent).toBe('01 · one lock');
    expect((await render({ title: 'A' })).querySelector('.ocx-feature__eyebrow')).toBeNull();
  });

  it('renders the `more` slot under the text, inside the text column, only when given', async () => {
    const doc = await render({ title: 'A' }, { more: '<a href="/docs/">read more</a>' });
    const more = doc.querySelector('.ocx-feature__text > .ocx-feature__more');
    expect(more?.querySelector('a')?.getAttribute('href')).toBe('/docs/');
    expect(more?.previousElementSibling?.className.split(' ')[0]).toBe('ocx-feature__body');
    expect((await render({ title: 'A' })).querySelector('.ocx-feature__more')).toBeNull();
  });

  it('`reveal` marks the section for the scroll module and has no effect on the reading order', async () => {
    const on = (await render({ title: 'A', reveal: true })).querySelector('.ocx-feature');
    expect(on?.hasAttribute('data-scroll')).toBe(true);
    expect(on?.hasAttribute('data-revealed')).toBe(false);
    expect((await render({ title: 'A' })).querySelector('.ocx-feature')?.hasAttribute('data-scroll')).toBe(false);
  });
});

// A controllable IntersectionObserver double.
class FakeIO {
  static instances: FakeIO[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;
  readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIO.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  fire(target: Element, isIntersecting: boolean, top = 100_000): void {
    if (this.disconnected || !this.observed.has(target)) return;
    // Not intersecting = wholly below the viewport unless `top` says otherwise.
    const entry = {
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: { top: isIntersecting ? 0 : top },
    } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

function sections(n: number): Element[] {
  const { document } = new JSDOM('<body></body>').window;
  return Array.from({ length: n }, () => document.body.appendChild(document.createElement('section')));
}

describe('WP13.4 FeatureSection reveal (feature-section.mjs)', () => {
  const io = () => {
    const last = FakeIO.instances.at(-1);
    if (!last) throw new Error('no IntersectionObserver constructed');
    return last;
  };

  it('WP13.4 FeatureSection: never reveals synchronously on mount, even for a section already in view (43d3f2dc9)', () => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const [a] = sections(1);
    revealOnIntersect([a!]);
    expect(a!.hasAttribute('data-revealed')).toBe(false);
    expect(io().observed.has(a!)).toBe(true);
  });

  it('WP13.4 FeatureSection: reveals from inside the IO callback on the first intersecting entry (43d3f2dc9)', () => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const [a] = sections(1);
    revealOnIntersect([a!]);
    io().fire(a!, false);
    expect(a!.hasAttribute('data-revealed')).toBe(false);
    io().fire(a!, true);
    expect(a!.hasAttribute('data-revealed')).toBe(true);
  });

  it('WP13.4 FeatureSection: one-shot — a revealed section stops being observed and never un-reveals (43d3f2dc9)', () => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const [a] = sections(1);
    revealOnIntersect([a!]);
    io().fire(a!, true);
    expect(io().observed.has(a!)).toBe(false);
  });

  it('WP13.4 FeatureSection: each section reveals independently; a later section still reveals after an earlier one (43d3f2dc9)', () => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const [a, b] = sections(2);
    revealOnIntersect([a!, b!]);
    io().fire(a!, true);
    expect(b!.hasAttribute('data-revealed')).toBe(false);
    io().fire(b!, true);
    expect(b!.hasAttribute('data-revealed')).toBe(true);
  });

  it('WP13.4 FeatureSection: only a section wholly below the viewport is hidden; one on screen at its first report reveals at once (LCP)', () => {
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    const [below, band] = sections(2);
    revealOnIntersect([below!, band!]);
    io().fire(below!, false);
    expect([below!.hasAttribute('data-pending'), below!.hasAttribute('data-revealed')]).toEqual([true, false]);
    io().fire(band!, false, 0);
    expect([band!.hasAttribute('data-pending'), band!.hasAttribute('data-revealed')]).toEqual([false, true]);
    io().fire(below!, false, 0);
    expect(below!.hasAttribute('data-revealed')).toBe(false);
    io().fire(below!, true);
    expect([below!.hasAttribute('data-pending'), below!.hasAttribute('data-revealed')]).toEqual([false, true]);
  });

  it('WP13.4 FeatureSection: without IntersectionObserver every section is revealed at once (content never stuck hidden)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const all = sections(2);
    revealOnIntersect(all);
    for (const s of all) expect(s.hasAttribute('data-revealed')).toBe(true);
  });
});
