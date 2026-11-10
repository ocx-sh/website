// ScrollStage, ScrollProgress, ScrollFade: the markup the scroll module drives, and the no-motion fallbacks.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const load = async (name: string) =>
  ((await import(`../src/components/${name}.astro`)) as { default: Component }).default;
const ScrollStage = await load('ScrollStage');
const ScrollProgress = await load('ScrollProgress');
const ScrollFade = await load('ScrollFade');
const ScrollReveal = await load('ScrollReveal');
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: { document: Document } } };
const css = (name: string) =>
  /<style[^>]*>([\s\S]*)<\/style>/.exec(
    readFileSync(new URL(`../src/components/${name}.astro`, import.meta.url), 'utf8'),
  )?.[1] ?? '';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (c: Component, props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
  new JSDOM(await container.renderToString(c, { props, slots })).window.document;

describe('ScrollStage', () => {
  const slots = {
    head: '<h2 id="h">The drift</h2>',
    default: '<div class="c">a</div><div class="c">b</div>',
    finale: '<code id="f">ocx add node</code>',
  };

  it('is a section: head, the items in their own container, then the finale, all in the pin', async () => {
    const doc = await render(ScrollStage, { label: 'The drift' }, slots);
    const stage = doc.querySelector('section.ocx-stage')!;
    expect(stage.getAttribute('aria-label')).toBe('The drift');
    const pin = stage.querySelector('[data-stage-pin]')!;
    expect([...pin.children].map((c) => c.className.split(' ')[0])).toEqual([
      'ocx-stage__head',
      'ocx-stage__items',
      'ocx-stage__finale',
    ]);
    expect(pin.querySelectorAll('[data-stage-items] > .c')).toHaveLength(2);
    expect(pin.querySelector('[data-stage-finale] #f')?.textContent).toBe('ocx add node');
  });

  it('leaves out an empty head and finale', async () => {
    const doc = await render(ScrollStage, {}, { default: '<div>a</div>' });
    expect(doc.querySelector('.ocx-stage__head')).toBeNull();
    expect(doc.querySelector('.ocx-stage__finale')).toBeNull();
    expect(doc.querySelector('.ocx-stage')?.hasAttribute('aria-label')).toBe(false);
  });

  it('starts readable (arrived, not struck, finale shown) and pins only where motion is allowed', () => {
    const style = css('ScrollStage');
    expect(style).toMatch(/--ocx-e:\s*1;/);
    expect(style).toMatch(/--ocx-s:\s*0;/);
    expect(style).toMatch(/--ocx-f:\s*1;/);
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n {4}\}\n/.exec(style)?.[1] ?? '';
    expect(reduced).toMatch(/\.ocx-stage\s*\{\s*block-size:\s*auto/);
    expect(reduced).toMatch(/position:\s*static/);
  });
});

describe('ScrollProgress', () => {
  it('is a decorative bar the module fills', async () => {
    const bar = (await render(ScrollProgress)).querySelector('.ocx-scroll-progress')!;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.hasAttribute('data-ocx-progress')).toBe(true);
    expect(bar.textContent).toBe('');
  });
});

describe('ScrollFade', () => {
  it('wraps its slot and carries the drift rate, 0.25 unless given', async () => {
    const fade = (await render(ScrollFade, {}, { default: '<p id="p">hero</p>' })).querySelector('.ocx-fade')!;
    expect(fade.querySelector('#p')?.textContent).toBe('hero');
    expect(fade.getAttribute('data-ocx-fade')).toBe('0.25');
    const slow = (await render(ScrollFade, { rate: 0.12, class: 'x' }, { default: 'a' })).querySelector('.ocx-fade')!;
    expect(slow.getAttribute('data-ocx-fade')).toBe('0.12');
    expect(slow.classList.contains('x')).toBe(true);
  });
});

describe('ScrollReveal', () => {
  it('wraps its slot and is marked for the scroll module', async () => {
    const el = (await render(ScrollReveal, { class: 'x' }, { default: '<p id="p">cta</p>' })).querySelector(
      '.ocx-scroll-reveal',
    )!;
    expect(el.hasAttribute('data-ocx-reveal')).toBe(true);
    expect(el.querySelector('#p')?.textContent).toBe('cta');
    expect(el.classList.contains('x')).toBe(true);
  });

  it('draws nothing under reduced motion or without scripting', () => {
    expect(css('ScrollReveal')).toMatch(/@media \(scripting: enabled\) and \(prefers-reduced-motion: no-preference\)/);
  });
});
