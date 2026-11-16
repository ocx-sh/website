// The folding outline (TableOfContents.astro, TocList.astro): which outlines fold and what the server renders (Astro
// Container), and the inline fold script run in jsdom: before first paint, on a button's click and on scroll.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
type Item = { depth: number; slug: string; text: string; children: Item[] };
const { JSDOM } = jsdom as {
  JSDOM: new (
    html: string,
    options: { url: string; runScripts: 'dangerously'; beforeParse: (w: Win) => void },
  ) => { window: Win };
};

const row = (slug: string, children: Item[] = [], depth = 2): Item => ({
  depth,
  slug,
  text: slug.toUpperCase(),
  children,
});
const sub = (slug: string) => row(slug, [], 3);
// 11 rows: Overview, five sections, five subsections under three of them.
const LONG = [
  row('_top'),
  row('s1', [sub('b1'), sub('b2')]),
  row('s2', [sub('c1')]),
  row('s3'),
  row('s4'),
  row('s5', [sub('e1'), sub('e2')]),
];
// 9 rows: the same without s5's subsections.
const SHORT = [...LONG.slice(0, 5), row('s5')];

const t = Object.assign((key: string) => key, { all: () => ({}) });
let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(items: Item[], spec = '../src/starlight/TableOfContents.astro'): Promise<string> {
  const component = ((await import(/* @vite-ignore */ spec)) as { default: Component }).default;
  return container.renderToString(component, {
    request: new Request('https://ocx.sh/docs/x/'),
    locals: {
      t,
      starlightRoute: { toc: { minHeadingLevel: 2, maxHeadingLevel: 3, items }, editUrl: undefined },
    } as unknown as App.Locals,
  });
}

/** The rendered outline in jsdom with its inline script run; `define` makes the spy start (the elements exist). */
function load(html: string, hash = '', define = false) {
  const { window } = new JSDOM(`<!doctype html><body>${html}</body>`, {
    url: `https://ocx.sh/docs/x/${hash}`,
    runScripts: 'dangerously',
    beforeParse: (w) => {
      if (define) w.customElements.define('mobile-starlight-toc', class extends w.HTMLElement {});
    },
  });
  const doc = window.document;
  const button = (s: string) =>
    doc.querySelector(`starlight-toc a[href="#${s}"]`)?.nextElementSibling as HTMLButtonElement;
  const open = () =>
    [...doc.querySelectorAll('starlight-toc button')].map((b) => [
      b.previousElementSibling?.getAttribute('href'),
      b.getAttribute('aria-expanded'),
      (b.nextElementSibling as HTMLElement).hidden,
    ]);
  return { window, doc, button, open };
}

describe('which outlines fold', () => {
  it('10 rows or more: each section with subsections gets a hidden, named button between its link and its list', async () => {
    const html = await render(LONG);
    const buttons = [
      ...html.matchAll(/<a href="#(\w+)">\w+<\/a><button type="button" aria-label="([^"]+)" hidden><\/button><ul/g),
    ];
    expect(buttons.map((m) => [m[1], m[2]])).toEqual([
      ['s1', 'Subsections of S1'],
      ['s2', 'Subsections of S2'],
      ['s5', 'Subsections of S5'],
    ]);
    expect(html.match(/<button/g)).toHaveLength(3); // the subsection rows, and the phone list, have none
    expect(html).toContain('F()'); // the fold script ships with the outline that folds
  });

  it('fewer than 10 rows: no button and no fold script', async () => {
    const html = await render(SHORT);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-expanded');
  });

  it('`foldOutline: false` keeps a long outline flat', async () => {
    vi.resetModules();
    vi.doMock('virtual:ocx-theme/options', () => ({ default: { foldOutline: false } }));
    const html = await render(LONG);
    vi.doUnmock('virtual:ocx-theme/options');
    vi.resetModules();
    expect(html).toContain('<starlight-toc');
    expect(html).not.toContain('<button');
  });
});

describe('the fold script', () => {
  it('before first paint: shows the buttons and folds every section, except the one the URL jumps into', async () => {
    const html = await render(LONG);
    expect(load(html).open()).toEqual([
      ['#s1', 'false', true],
      ['#s2', 'false', true],
      ['#s5', 'false', true],
    ]);
    const jumped = load(html, '#e2');
    expect(jumped.open()).toEqual([
      ['#s1', 'false', true],
      ['#s2', 'false', true],
      ['#s5', 'true', false],
    ]);
    expect(jumped.button('s1').hidden).toBe(false);
  });

  it('a click toggles a section, and what the reader set by hand outlives the scroll; the focus keeps its section open', async () => {
    const html = await render(LONG);
    // jsdom has no layout: the spy always lands on Overview, which no section holds.
    const { window, button, open } = load(html, '', true);
    await new Promise((r) => window.setTimeout(r, 0)); // whenDefined: the spy is listening
    button('s1').click(); // opened by hand
    button('s2').click();
    button('s2').click(); // opened and closed again by hand
    button('s5').click();
    expect(open().map((r) => r[1])).toEqual(['true', 'false', 'true']);
    window.dispatchEvent(new window.Event('scroll'));
    expect(open().map((r) => r[1])).toEqual(['true', 'false', 'true']);
    expect(open().map((r) => r[2])).toEqual([false, true, false]); // each list follows its button

    // A section the spy opened (here: the jump's, in a fresh page) folds when the reading moves on, unless it holds the focus.
    const fresh = load(html, '#e1', true);
    await new Promise((r) => fresh.window.setTimeout(r, 0));
    (fresh.doc.querySelector('starlight-toc a[href="#e2"]') as HTMLElement).focus();
    fresh.window.dispatchEvent(new fresh.window.Event('scroll'));
    expect(fresh.open().map((r) => r[1])).toEqual(['false', 'false', 'true']);
    (fresh.doc.activeElement as HTMLElement).blur();
    fresh.window.dispatchEvent(new fresh.window.Event('scroll'));
    expect(fresh.open().map((r) => r[1])).toEqual(['false', 'false', 'false']);
  });
});
