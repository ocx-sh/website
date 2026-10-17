// Fetch-on-open (`src`) on Popover and Hint, SSR half: markup via the Astro Container API. The page
// carries the URL and the states, and no fetch happens at render. Behaviour: ui-fill.dom.test.ts.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Popover = await load('Popover');
const Hint = await load('Hint');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(c: Component, props: Record<string, unknown>, slots: Record<string, string> = {}) {
  const html = await container.renderToString(c, { props, slots });
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

describe('Popover src', () => {
  it('writes data-fill-src and a region with a Loader and a hidden-by-CSS error with Retry', async () => {
    const doc = await render(Popover, { src: '/v/1.html' }, { trigger: 'Version', default: 'ignored slot' });
    expect(doc.querySelector('.ocx-ui-popover')?.getAttribute('data-fill-src')).toBe('/v/1.html');
    const region = doc.querySelector('[data-part="content"] [data-fill]');
    expect(region?.getAttribute('data-fill-state')).toBe('idle');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.querySelector('[data-fill-loading] .ocx-ui-loader')?.textContent).toContain('Loading…');
    expect(region?.querySelector('[data-fill-error] p')?.textContent).toBe('Could not load this.');
    expect(region?.querySelector('[data-fill-error] button[data-fill-retry]')?.textContent.trim()).toBe('Retry');
    expect(doc.body.textContent).not.toContain('ignored slot');
  });

  it('labels set the three texts', async () => {
    const doc = await render(Popover, { src: '/v.html', labels: { loading: 'Wait', error: 'Nope', retry: 'Again' } });
    expect(doc.querySelector('[data-fill-loading]')?.textContent).toContain('Wait');
    expect(doc.querySelector('[data-fill-error] p')?.textContent).toBe('Nope');
    expect(doc.querySelector('[data-fill-retry]')?.textContent.trim()).toBe('Again');
  });

  it('without src: the slot, no region, no data-fill-src', async () => {
    const doc = await render(Popover, {}, { trigger: 'Details', default: 'Body' });
    expect(doc.querySelector('[data-fill]')).toBeNull();
    expect(doc.querySelector('.ocx-ui-popover')?.hasAttribute('data-fill-src')).toBe(false);
    expect(doc.querySelector('[data-part="content"]')?.textContent).toContain('Body');
  });

  it('src stays out of the Zag machine props', async () => {
    const doc = await render(Popover, { src: '/v.html' });
    expect(
      JSON.parse(doc.querySelector<HTMLElement>('.ocx-ui-popover')?.dataset['zagProps'] ?? '{}'),
    ).not.toHaveProperty('src');
  });
});

describe('Hint src', () => {
  it('writes data-fill-src and keeps the label as the first text', async () => {
    const doc = await render(Hint, { label: 'loading…', src: '/h.txt' }, { default: '<button>i</button>' });
    expect(doc.querySelector('.ocx-ui-hint')?.getAttribute('data-fill-src')).toBe('/h.txt');
    expect(doc.querySelector('[data-part="content"]')?.textContent.trim()).toBe('loading…');
  });

  it('without src: no data-fill-src', async () => {
    const doc = await render(Hint, { label: 'x' }, { default: '<button>i</button>' });
    expect(doc.querySelector('.ocx-ui-hint')?.hasAttribute('data-fill-src')).toBe(false);
  });
});
