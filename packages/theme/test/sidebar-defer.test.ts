// Sidebar deferral (Sidebar.astro, frag-sidebar.astro): which groups ship empty, and the no-JS fallbacks.
// The sidebar the fragment route serves is the mocked configured one.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const link = (label: string, href: string, isCurrent = false) => ({
  type: 'link' as const,
  label,
  href,
  isCurrent,
  badge: undefined,
  attrs: {},
});
const group = (label: string, entries: unknown[], collapsed = false) => ({
  type: 'group' as const,
  label,
  entries,
  collapsed,
  badge: undefined,
});
const sidebar = (current = '/docs/a/') => [
  group('Guides', [
    link('A', '/docs/a/', current === '/docs/a/'),
    group('Here', [link('B', '/docs/b/', current === '/docs/b/')], true),
    group('Away', [link('C', '/docs/c/'), link('D', '/docs/d/')], true),
    group('Wrap', [group('Inner', [link('F', '/docs/f/')], true), link('G', '/docs/g/')], true),
    group('Open', [link('E', '/docs/e/')], false),
  ]),
];
vi.mock('virtual:ocx-theme/sidebar', () => ({ configSidebar: () => sidebar() }));

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as {
  JSDOM: new (
    html: string,
    options?: { runScripts?: 'dangerously'; url?: string; beforeParse?: (w: Win) => void },
  ) => { window: Win };
};
const t = Object.assign((key: string) => key, { all: () => ({}) });
let container: AstroContainer;
const load = async (name: string) =>
  ((await import(`../src/starlight/${name}.astro`)) as { default: Component }).default;
const render = async (name: string, current: string, params: Record<string, string> = {}) =>
  container.renderToString(await load(name), {
    params,
    request: new Request(`https://ocx.sh${current}`),
    locals: {
      t,
      starlightRoute: { hasSidebar: true, sidebar: sidebar(current), entry: { data: { title: 'x' } }, dir: 'ltr' },
    } as unknown as App.Locals,
  });

beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('deferred sidebar groups', () => {
  it('a collapsed group without the current page ships empty with its link count; an open group keeps its links', async () => {
    const d = new JSDOM(await render('Sidebar', '/docs/a/')).window.document;
    const deferred = [...d.querySelectorAll('[data-defer]')];
    expect(deferred).toHaveLength(3); // Here, Away, Wrap (Inner is inside it, not rendered)
    expect(deferred.every((list) => list.children.length === 0)).toBe(true);
    expect(deferred[1]?.getAttribute('style')).toContain('--n:2');
    expect(d.querySelector('a[href="/docs/e/"]')).not.toBeNull(); // the open group is inline
  });

  it('a stored open state follows its group when a deferred parent hides the groups inside it', async () => {
    const markup = await render('Sidebar', '/docs/a/');
    const hash = new JSDOM(markup).window.document.querySelector('sl-sidebar-state-persist')?.getAttribute('data-hash');
    // Whole-sidebar slots: Here 0, Away 1, Wrap 2, Inner 3 (not rendered), Open 4.
    const w = new JSDOM(`<div id="starlight__sidebar">${markup}</div>`, {
      runScripts: 'dangerously',
      url: 'https://ocx.sh/docs/a/',
      beforeParse(win) {
        win.matchMedia = ((q: string) => ({ matches: q.includes('min-width: 50em') })) as unknown as Win['matchMedia'];
        win.sessionStorage.setItem('sl-sidebar-state', JSON.stringify({ hash, open: [null, null, null, true, false] }));
      },
    }).window;
    const open = (label: string) => {
      const g = [...w.document.querySelectorAll<HTMLElement>('[data-zag-root="collapsible"]')].find((el) =>
        el.textContent?.trim().startsWith(label),
      );
      return g!.querySelector<HTMLElement>(':scope > [data-part="content"]')!.hidden === false;
    };
    expect(open('Open')).toBe(false); // slot 4 closed it
    expect(open('Wrap')).toBe(false); // slot 3 (Inner, absent) opened nothing here
    expect(open('Away')).toBe(false);
  });

  it('the restore wakes the controller with a touch that bubbles to the sidebar (a bare event never reaches its listener)', async () => {
    const d = new JSDOM(await render('Sidebar', '/docs/a/')).window.document;
    expect(d.querySelector('sl-sidebar-state-persist script')?.textContent).toContain(
      "new Event('focusin',{bubbles:true})",
    );
  });

  it('the group holding the current page always ships its links', async () => {
    const d = new JSDOM(await render('Sidebar', '/docs/b/')).window.document;
    expect(d.querySelectorAll('[data-defer]')).toHaveLength(2); // Away, Wrap
    expect(d.querySelector('a[href="/docs/b/"]')).not.toBeNull();
    expect(d.querySelector('a[href="/docs/e/"]')).not.toBeNull();
  });

  it('JS off: "All pages" comes before the groups and the empty deferred group is hidden', async () => {
    const markup = await render('Sidebar', '/docs/a/');
    expect(markup.indexOf('_all/')).toBeGreaterThan(-1);
    expect(markup.indexOf('_all/')).toBeLessThan(markup.indexOf('top-level'));
    expect(markup).toMatch(/li:has\(>\[data-defer\]\)\{display:none\}/);
  });
});

describe('the _all fragment', () => {
  it('names itself with an h1 and links back to the docs', async () => {
    const d = new JSDOM(await render('frag-sidebar', '/docs/frag/sidebar/_all/', { key: '_all' })).window.document;
    expect(d.querySelector('h1')?.textContent).toBe('All pages');
    expect(d.querySelector('nav a[href]')?.textContent).toBe('Back to the docs');
    expect(d.querySelector('a[href="/docs/c/"]')).not.toBeNull();
  });
});
