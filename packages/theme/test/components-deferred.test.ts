// Deferred markup: a swap box with a required, aria-hidden skeleton, an empty content cell, a hidden
// error block with Retry and a no-JS link. The loader is in deferred.dom.test.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const Deferred = ((await import(`../src/components/${'Deferred'}.astro`)) as { default: Component }).default;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = async (
  props: Record<string, unknown>,
  slots: Record<string, string> = { skeleton: '<i id="sk"></i>' },
) => new JSDOM(await container.renderToString(Deferred, { props, slots })).window.document;

describe('Deferred markup', () => {
  it('is a swap box: aria-hidden skeleton wrapper, empty named content cell, hidden error with Retry', async () => {
    const doc = await render({ src: '/frag/x/', label: 'Shell session' });
    const box = doc.querySelector('.ocx-swap[data-ocx-deferred]')!;
    expect(box.getAttribute('data-src')).toBe('/frag/x/');
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.hasAttribute('data-loaded')).toBe(false);
    const [skeleton, content, error] = [...box.children];
    expect(skeleton?.hasAttribute('data-swap-skeleton')).toBe(true);
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton?.querySelector('#sk')).not.toBeNull();
    expect(content?.getAttribute('aria-label')).toBe('Shell session');
    expect(content?.children).toHaveLength(0);
    expect(error?.hasAttribute('hidden')).toBe(true);
    expect(error?.querySelector('[data-deferred-retry]')?.textContent?.trim()).toBe('Retry');
  });

  it('leaves a link to the fragment for a visitor without JS', async () => {
    const doc = await render({ src: '/frag/x/', label: 'Shell session' });
    const link = doc.querySelector('noscript a');
    expect(link?.getAttribute('href')).toBe('/frag/x/');
    expect(link?.textContent).toBe('Shell session');
    expect(doc.querySelector('.ocx-swap')?.nextElementSibling?.localName).toBe('noscript');
  });

  it('takes custom error and retry text', async () => {
    const doc = await render({ src: '/frag/x/', label: 'L', error: 'Nope', retry: 'Again' });
    expect(doc.querySelector('[data-deferred-error] p')?.textContent).toBe('Nope');
    expect(doc.querySelector('[data-deferred-retry]')?.textContent?.trim()).toBe('Again');
  });

  it('requires the skeleton slot: a box with no reserved size would shift the page', async () => {
    await expect(render({ src: '/frag/x/', label: 'L' }, {})).rejects.toThrow(/skeleton/);
  });

  it('keeps swap CSS honest: the swap selectors know the data-swap-skeleton wrapper', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/components/ui/skeleton.css'), 'utf8');
    expect(css).toMatch(/\.ocx-swap > :not\(\.ocx-ui-skeleton, \[data-swap-skeleton\]\)/);
  });
});
