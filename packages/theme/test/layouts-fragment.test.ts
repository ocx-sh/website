// Fragment layout: the bare document a Deferred fetches. No chrome, no site CSS, never indexed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { describe, expect, it } from 'vitest';

const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };

type Component = Parameters<AstroContainer['renderToString']>[0];

const render = async () => {
  const layout = 'Fragment';
  const Fragment = ((await import(`../src/layouts/${layout}.astro`)) as { default: Component }).default;
  const container = await AstroContainer.create();
  const html = await container.renderToString(Fragment, {
    props: { title: 'Demo' },
    slots: { default: '<p id="body">hello</p>' },
  });
  return new JSDOM(html).window.document;
};

describe('Fragment layout', () => {
  it('is noindex, ignored by Pagefind and carries the slot', async () => {
    const doc = await render();
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(doc.body.getAttribute('data-pagefind-ignore')).toBe('all');
    expect(doc.querySelector('#body')?.textContent).toBe('hello');
    expect(doc.title).toBe('Demo');
  });

  it('is bare: no stylesheet, script, header or footer of its own', async () => {
    const doc = await render();
    expect(doc.querySelectorAll('link[rel=stylesheet],style,script,header,footer,nav')).toHaveLength(0);
  });

  it('imports no site CSS', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/layouts/Fragment.astro'), 'utf8');
    expect(source).not.toMatch(/^import /m);
  });
});
