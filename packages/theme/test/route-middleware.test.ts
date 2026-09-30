// Route middleware (design §4.1, §4.4): the PageTitle breadcrumb trail (C-025 input) and the
// opt-in sidebar flattening (#1b).
import type { APIContext } from 'astro';
import { describe, expect, it, vi } from 'vitest';
import {
  createOnRequest,
  flattenSidebar,
  groupPath,
  onRequest,
  pageTrail,
} from '../src/starlight/route-middleware.mjs';
import type { OcxRouteData } from '../src/starlight/route-middleware.mjs';

type Sidebar = OcxRouteData['sidebar'];
type Entry = Sidebar[number];

const link = (label: string, isCurrent = false): Entry => ({
  type: 'link',
  label,
  href: `/docs/${label}/`,
  isCurrent,
  badge: undefined,
  attrs: {},
});
const group = (label: string, entries: Entry[]): Entry => ({
  type: 'group',
  label,
  entries,
  collapsed: false,
  badge: undefined,
});

/** Runs a route middleware against a bare route; returns the route and the `next` spy. */
async function run(
  handler: ReturnType<typeof createOnRequest>,
  sidebar: Sidebar,
  { path = '/docs/guides/b/', template = 'doc' } = {},
) {
  const starlightRoute = { sidebar, entry: { data: { title: 'B', template } } } as unknown as OcxRouteData;
  let settled = false;
  const next = vi.fn(() => new Promise<void>((resolve) => setTimeout(() => ((settled = true), resolve()), 1)));
  await handler({ locals: { starlightRoute }, url: new URL(`https://ocx.sh${path}`) } as unknown as APIContext, next);
  return { starlightRoute, next, settled };
}

describe('groupPath', () => {
  it('C-025: top-level current page has no groups', () => {
    expect(groupPath([link('a', true), group('G', [link('b')])])).toEqual([]);
  });

  it('C-025: returns the group holding the current link', () => {
    expect(groupPath([link('a'), group('Getting started', [link('b'), link('c', true)])])).toEqual(['Getting started']);
  });

  it('C-025: nested groups return the chain, outermost first', () => {
    const sidebar = [group('Outer', [link('a'), group('Inner', [link('b', true)])]), group('Other', [link('c')])];
    expect(groupPath(sidebar)).toEqual(['Outer', 'Inner']);
  });

  it('C-025: no current link → []', () => {
    expect(groupPath([link('a'), group('G', [link('b'), group('H', [link('c')])])])).toEqual([]);
  });
});

describe('pageTrail', () => {
  const root = { label: 'ocx.sh', href: '/' };
  it.each([
    ['/docs/x/', ['Getting started'], ['ocx.sh /', 'docs /docs/', 'Getting started', 'Page']],
    ['/docs/x/', [], ['ocx.sh /', 'docs /docs/', 'Page']],
    [
      '/integrations/bazel/x/',
      ['Rules'],
      ['ocx.sh /', 'integrations /integrations/', 'Bazel /integrations/bazel/', 'Rules', 'Page'],
    ],
    ['/unknown/', ['A', 'B'], ['ocx.sh /', 'A', 'B', 'Page']],
  ])('C-025: %s with groups %j → %j', (path, groups, want) => {
    const trail = pageTrail({ path, title: 'Page', groups, root });
    expect(trail.map((c) => (c.href ? `${c.label} ${c.href}` : c.label))).toEqual(want);
  });

  it('C-025: a crumb linking the page itself is dropped (section and hub index pages)', () => {
    expect(pageTrail({ path: '/docs/', title: 'Docs home', groups: [], root })).toEqual([root, { label: 'Docs home' }]);
    expect(pageTrail({ path: '/', title: 'Home', groups: [], root })).toEqual([{ label: 'Home' }]);
  });

  it('C-025: root false or undefined → no root crumb', () => {
    for (const r of [false as const, undefined])
      expect(pageTrail({ path: '/apps/', title: 'Apps', groups: [], root: r })).toEqual([{ label: 'Apps' }]);
  });
});

describe('createOnRequest', () => {
  const sidebar = (): Sidebar => [
    link('home'),
    group('Guides', [link('a'), link('b', true)]),
    group('Reference', [link('c')]),
  ];

  const labels = (route: OcxRouteData) => route.ocxTrail?.map((c) => c.label);

  it('C-025: default sets starlightRoute.ocxTrail with no root crumb and leaves sidebar untouched', async () => {
    const original = sidebar();
    const { starlightRoute } = await run(createOnRequest(), original);
    expect(labels(starlightRoute)).toEqual(['docs', 'Guides', 'B']);
    expect(starlightRoute.ocxTrail?.[0]?.href).toBe('/docs/');
    expect(starlightRoute.sidebar).toBe(original);
    expect(starlightRoute.sidebar).toEqual(sidebar());
  });

  it('C-025: exported onRequest is the non-flattening default with the plugin options (no root)', async () => {
    const original = sidebar();
    const { starlightRoute } = await run(onRequest, original);
    expect(labels(starlightRoute)).toEqual(['docs', 'Guides', 'B']);
    expect(starlightRoute.sidebar).toEqual(sidebar());
  });

  it('C-025: top-level page has no group crumb', async () => {
    const { starlightRoute } = await run(createOnRequest(), [link('home', true), group('Guides', [link('a')])]);
    expect(labels(starlightRoute)).toEqual(['docs', 'B']);
  });

  it('C-025: root false drops the root crumb; a custom root adds it', async () => {
    const drop = await run(createOnRequest({ breadcrumbs: { root: false } }), sidebar());
    expect(labels(drop.starlightRoute)).toEqual(['docs', 'Guides', 'B']);
    const dflt = await run(createOnRequest({ breadcrumbs: {} }), sidebar());
    expect(labels(dflt.starlightRoute)).toEqual(['docs', 'Guides', 'B']);
    const own = await run(createOnRequest({ breadcrumbs: { root: { label: 'home', href: '/x/' } } }), sidebar());
    expect(own.starlightRoute.ocxTrail?.[0]).toEqual({ label: 'home', href: '/x/' });
  });

  it('C-025: splash pages and breadcrumbs: false get an empty trail', async () => {
    expect((await run(onRequest, sidebar(), { template: 'splash' })).starlightRoute.ocxTrail).toEqual([]);
    expect((await run(createOnRequest({ breadcrumbs: false }), sidebar())).starlightRoute.ocxTrail).toEqual([]);
  });

  it('C-025: next() is called exactly once and awaited', async () => {
    const { next, settled } = await run(createOnRequest(), sidebar());
    expect(next).toHaveBeenCalledOnce();
    expect(settled).toBe(true);
  });

  it('§4.4 sidebar (no C-ID): flatten: true replaces sidebar with the flattened shape and keeps the unflattened group chain', async () => {
    const nested = [link('home'), group('Guides', [link('a'), group('Deep', [link('b', true)])])];
    const { starlightRoute, next } = await run(createOnRequest({ flatten: true }), nested);
    expect(starlightRoute.sidebar).toEqual(flattenSidebar(nested));
    expect(starlightRoute.sidebar).toEqual([link('home'), group('Guides', [link('a'), link('b', true)])]);
    expect(labels(starlightRoute)).toEqual(['docs', 'Guides', 'Deep', 'B']);
    expect(next).toHaveBeenCalledOnce();
  });
});

// Pinned flattened shape (mock #1b: mono-caps group headings over flat link
// lists): top-level links stay as they are; every top-level group keeps its
// label/collapsed/badge but its nested groups dissolve, their links inlined
// depth-first in document order, so a top-level group holds only links.
describe('flattenSidebar', () => {
  it('§4.4 sidebar (no C-ID): nested groups collapse into their top-level group, in order', () => {
    const sidebar = [
      link('home'),
      group('A', [link('a1'), group('B', [link('b1', true), group('C', [link('c1')])]), link('a2')]),
      group('D', [link('d1')]),
    ];
    expect(flattenSidebar(sidebar)).toEqual([
      link('home'),
      group('A', [link('a1'), link('b1', true), link('c1'), link('a2')]),
      group('D', [link('d1')]),
    ]);
  });

  it('§4.4 sidebar (no C-ID): an already-flat sidebar is unchanged and not mutated', () => {
    const flat = [link('home'), group('A', [link('a1')])];
    const copy = structuredClone(flat);
    expect(flattenSidebar(flat)).toEqual(copy);
    expect(flat).toEqual(copy);
  });
});
