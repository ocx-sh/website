// The live header (r10): the fragment the root site publishes, the rev every baked header carries, and
// the loader that swaps the live nav into a stale page. Real markup (the Astro container renders
// SiteHeader and the fragment) in jsdom; the browser half is tests/e2e/shell-live.spec.ts.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import nav from '../src/nav.json' with { type: 'json' };
import { renderShell } from '../src/shell-render.mjs';
import { shellRev } from '../src/shell-rev.mjs';
import { swapShell } from '../src/shell-swap.mjs';
import { syncShell } from '../src/shell-sync.mjs';
import { SHELL_DIR, SHELL_HOST, SHELL_PARTS, SHELL_REV } from '../src/shell.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as { JSDOM: new (html: string, options?: { url: string }) => { window: Win } };
const label = nav.sections.find((s) => !('href' in s))?.label ?? '';

let container: AstroContainer;
let fragment: string;
let Shell: Component;
let SiteHeader: Component;
const load = async (dir: string, name: string): Promise<Component> =>
  ((await import(`../src/${dir}/${name}.astro`)) as { default: Component }).default;

const header = (props: Record<string, unknown> = {}, path = '/docs/x/') =>
  container.renderToString(SiteHeader, {
    request: new Request(`https://ocx.sh${path}`),
    props: { menu: true, active: 'docs', ...props },
    slots: { search: '<input id="own-search">' },
  });

/** A baked page: a jsdom window on ocx.sh with the header, the globals the loader reads, and mount spies. */
async function baked(props: Record<string, unknown> = {}, path = '/docs/x/', origin = 'https://ocx.sh') {
  const win = new JSDOM(`<!doctype html><body>${await header(props, path)}`, { url: `${origin}${path}` }).window;
  vi.stubGlobal('DOMParser', win.DOMParser);
  const doc = win.document;
  const root = doc.querySelector<HTMLElement>('.ocx-header')!;
  const zag = root.querySelector<HTMLElement>('[data-zag-root="navigation-menu"]')!;
  return { win, doc, root, zag };
}

/** The live fragment: the baked one with the ecosystem section renamed, and its rev. */
const live = (html = fragment.replaceAll(`>${label}<`, '>platform<')) => ({ html, rev: shellRev(html) });

/** `fetch` serving `html` at `rev`'s address (or the given `status`) and nothing else. */
function serve(rev: string, html: string, status = 200) {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      url === `${SHELL_DIR}${rev}/nav.html` ? new Response(html, { status }) : new Response('', { status: 404 }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const text = (el: Element | null | undefined) => el?.textContent.trim();
const trigger = (root: Element) => root.querySelector('button[data-ocx-section="ecosystem"]');

beforeAll(async () => {
  container = await AstroContainer.create();
  fragment = await renderShell();
  Shell = await load('layouts', 'Shell');
  SiteHeader = await load('components', 'SiteHeader');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the fragment', () => {
  const parts = (): Record<string, DocumentFragment> => {
    const doc = new JSDOM(fragment).window.document;
    return Object.fromEntries(
      [...doc.querySelectorAll<HTMLTemplateElement>('template[data-shell-part]')].map(
        (t) => [t.dataset['shellPart'] ?? '', t.content] as const,
      ),
    );
  };

  it('holds exactly the SHELL_PARTS templates, in order, each with markup', () => {
    expect(SHELL_PARTS).toEqual(['sections', 'mega', 'drawer']);
    expect([...fragment.matchAll(/<template data-shell-part="([^"]+)">/g)].map((m) => m[1])).toEqual([...SHELL_PARTS]);
    for (const name of SHELL_PARTS) expect(parts()[name]?.children.length, name).toBeGreaterThan(0);
  });

  it('carries no page state: no current link, no consumer link, no search, only root-relative or https links', () => {
    expect(fragment).not.toContain('aria-current');
    expect(fragment).not.toContain('data-ocx-section="extra"');
    expect(fragment).not.toContain('site-search');
    const doc = new JSDOM(fragment).window.document;
    const hrefs = Object.values(parts()).flatMap((p) => [...p.querySelectorAll('[href]')]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const a of hrefs) expect(a.getAttribute('href'), a.outerHTML).toMatch(/^(?:\/(?!\/)|https:\/\/)/);
    expect(doc.querySelector('script')).toBeNull();
  });

  it('is named by the first 12 hex characters of its SHA-256, and a changed nav is named differently', () => {
    expect(shellRev(fragment)).toMatch(SHELL_REV);
    expect(shellRev(fragment)).toBe(shellRev(String(fragment)));
    expect(live().rev).not.toBe(shellRev(fragment));
  });

  it("is the header's own markup: a header with no active section, no extra links and no current link bakes the same parts", async () => {
    const { doc } = await baked({ active: '' }, '/zzz/');
    const baseline = parts();
    const html = (nodes: Iterable<Element>) => [...nodes].map((n) => n.outerHTML).join('');
    expect(html(doc.querySelectorAll('.ocx-header__nav > ul > li'))).toBe(html(baseline['sections']!.children));
    expect(html(doc.querySelectorAll('.ocx-header [data-zag-root] > nav.ocx-mega'))).toBe(
      html(baseline['mega']!.children),
    );
    expect(html(doc.querySelectorAll('#ocx-header-menu > ul > li'))).toBe(html(baseline['drawer']!.children));
  });
});

describe('data-nav-rev', () => {
  it('every ocx header carries the rev of the fragment, in the Starlight header and in Shell alike', async () => {
    expect((await baked()).zag.dataset['navRev']).toBe(shellRev(fragment));
    const html = await container.renderToString(Shell, {
      request: new Request('https://ocx.sh/x/'),
      props: { title: 'T' },
    });
    expect(new JSDOM(html).window.document.querySelector('[data-nav-rev]')?.getAttribute('data-nav-rev')).toBe(
      shellRev(fragment),
    );
  });

  it('a neutral (brand) header has no ocx nav to swap and carries none', async () => {
    const { doc } = await baked({ brand: { title: 'Mirror' }, nav: [{ label: 'A', href: '/a/' }] });
    expect(doc.querySelector('[data-nav-rev]')).toBeNull();
  });
});

describe('swapShell', () => {
  it("swaps the live sections, panel and drawer in, keeps the page's own, and re-applies what is current", async () => {
    const { win, doc, root, zag } = await baked({ extraNav: [{ label: 'Blog', href: '/blog/' }] });
    const { html, rev } = live();
    const before = text(trigger(root));
    const fetch = serve(rev, html);
    expect(await swapShell(doc, zag, rev)).toBe(true);

    expect(fetch).toHaveBeenCalledWith(`/_shell/v1/${rev}/nav.html`);
    expect(before).toBe(label);
    expect(text(trigger(root))).toBe('platform');
    expect(zag.dataset['navRev']).toBe(rev);
    // The nav's machine is armed again: the next pointer entry starts loading it.
    zag.dispatchEvent(new win.Event('pointerenter'));
    expect(zag.dataset['zagState']).toBe('loading');
    // The page's own state survives: the search slot, the extra link, the active section's mark.
    expect(doc.getElementById('own-search')).not.toBeNull();
    expect(text(root.querySelector('[data-ocx-section="extra"]'))).toBe('Blog');
    expect(root.querySelector('[aria-current="page"][data-ocx-section]')?.getAttribute('data-ocx-section')).toBe(
      'docs',
    );
    expect(trigger(root)?.hasAttribute('aria-current')).toBe(false);
    expect(root.querySelectorAll('.ocx-mega')).toHaveLength(1);
    expect(text(root.querySelector('#ocx-header-menu button'))).toBe('platform');
    expect(root.querySelector('#ocx-header-menu a[aria-current="page"]')?.getAttribute('href')).toBe('/docs/');
    expect(doc.querySelectorAll('#ocx-header-menu li:last-child a[href="/blog/"]')).toHaveLength(1);
    // Order: the nav.json sections first, the consumer's link after.
    const order = [...root.querySelectorAll('.ocx-header__nav > ul > li > [data-ocx-section]')].map((e) =>
      e.getAttribute('data-ocx-section'),
    );
    expect(order).toEqual([...nav.sections.map((s) => s.id), 'extra']);
    expect(win.document.querySelectorAll('[id="ocx-ecosystem-menu"]')).toHaveLength(1);
  });

  it('keeps the active mark on the trigger when the active section is the menu', async () => {
    const { doc, root, zag } = await baked({ active: 'ecosystem' }, '/apps/');
    const { html, rev } = live();
    serve(rev, html);
    expect(await swapShell(doc, zag, rev)).toBe(true);
    expect(trigger(root)?.getAttribute('aria-current')).toBe('page');
    expect(root.querySelector('#ocx-header-menu a[aria-current="page"]')?.getAttribute('href')).toBe('/apps/');
  });

  it('works on a header without a drawer (the Starlight header)', async () => {
    const { doc, root, zag } = await baked({ menu: false });
    const { html, rev } = live();
    serve(rev, html);
    expect(await swapShell(doc, zag, rev)).toBe(true);
    expect(text(trigger(root))).toBe('platform');
  });

  const refused = async (html: string, status = 200, setup?: (p: Awaited<ReturnType<typeof baked>>) => void) => {
    const page = await baked();
    setup?.(page);
    const rev = shellRev(html);
    serve(rev, html, status);
    const snapshot = page.root.outerHTML;
    expect(await swapShell(page.doc, page.zag, rev)).toBe(false);
    expect(page.root.outerHTML).toBe(snapshot);
    return page;
  };
  const without = (part: string) =>
    fragment.replace(new RegExp(`<template data-shell-part="${part}">[\\s\\S]*?</template>`), '');

  it('refuses a missing fragment (404), keeping the baked header', async () => {
    await refused(live().html, 404);
  });

  it.each(SHELL_PARTS)('refuses a fragment without the %s part', async (part) => {
    await refused(without(part));
  });

  it.each([
    ['a script', (h: string) => h.replace('<li id=', '<script>1</script><li id=')],
    ['an inline handler', (h: string) => h.replace('<a href="/docs/"', '<a onclick="x()" href="/docs/"')],
    ['a javascript: link', (h: string) => h.replace('href="/docs/"', 'href="javascript:alert(1)"')],
    ['a protocol-relative link', (h: string) => h.replace('href="/docs/"', 'href="//evil.example/"')],
    [
      'a trigger that names no panel',
      (h: string) => h.replace('popovertarget="ocx-ecosystem-menu"', 'popovertarget="x"'),
    ],
    [
      'a panel that is not a popover nav',
      (h: string) => h.replace('<nav class="ocx-mega" popover', '<div class="ocx-mega"'),
    ],
    [
      'an empty sections part',
      (h: string) => h.replace(/(<template data-shell-part="sections">)[\s\S]*?(<\/template>)/, '$1$2'),
    ],
  ])('refuses a fragment with %s', async (_, mutate) => {
    const html = mutate(fragment);
    expect(html).not.toBe(fragment);
    await refused(html);
  });

  it('refuses while the nav machine is loading, and while focus is inside the nav', async () => {
    await refused(live().html, 200, ({ zag }) => zag.setAttribute('data-zag-state', 'loading'));
    await refused(live().html, 200, ({ root }) =>
      root.querySelector<HTMLElement>('a[data-ocx-section="docs"]')!.focus(),
    );
  });

  it('refuses while a panel or the drawer is open', async () => {
    const open = (el: Element | null) => {
      const matches = el!.matches.bind(el);
      vi.spyOn(el!, 'matches').mockImplementation((s: string) => s === ':popover-open' || matches(s));
    };
    await refused(live().html, 200, ({ doc }) => open(doc.getElementById('ocx-ecosystem-menu')));
    await refused(live().html, 200, ({ doc }) => open(doc.getElementById('ocx-header-menu')));
  });

  it('puts the baked nav back when the swap would change the header box', async () => {
    const { doc, root, zag } = await baked();
    const { html, rev } = live();
    serve(rev, html);
    const snapshot = root.outerHTML;
    const heights = [48, 96];
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(
      () => ({ height: heights.shift() ?? 96 }) as unknown as DOMRect,
    );
    expect(await swapShell(doc, zag, rev)).toBe(false);
    expect(root.outerHTML).toBe(snapshot);
    zag.dispatchEvent(new (doc.defaultView as Win).Event('pointerenter'));
    expect(zag.dataset['zagState']).toBe('loading');
  });
});

describe('syncShell', () => {
  const pointer = (body: unknown, status = 200) => ({ ok: status === 200, status, json: () => Promise.resolve(body) });

  /** Runs the trigger on a baked page and lets its promise chain settle. */
  async function run({ origin = 'https://ocx.sh', current }: { origin?: string; current: () => unknown }) {
    const page = await baked({}, '/docs/x/', origin);
    const requested: string[] = [];
    const swapped = live();
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string, init?: RequestInit) => {
        requested.push(u);
        void init;
        if (u.endsWith('current.json')) {
          const r = current();
          return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
        }
        return Promise.resolve(new Response(swapped.html));
      }),
    );
    Object.assign(page.win, { requestIdleCallback: (f: () => void) => f() });
    Object.defineProperty(page.doc, 'readyState', { value: 'complete' });
    syncShell(page.doc, page.zag);
    await new Promise((r) => setTimeout(r, 100));
    return { ...page, requested, swapped };
  }

  it("asks the pointer with no-cache and, for another rev, fetches that rev's fragment and swaps it in", async () => {
    const swapped = live();
    const r = await run({ current: () => pointer({ v: 1, rev: swapped.rev }) });
    expect(r.requested).toEqual([`${SHELL_DIR}current.json`, `${SHELL_DIR}${swapped.rev}/nav.html`]);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toEqual({ cache: 'no-cache' });
    expect(r.zag.dataset['navRev']).toBe(swapped.rev);
    expect(text(trigger(r.root))).toBe('platform');
  });

  it('stops at the pointer when the baked rev is current', async () => {
    const r = await run({ current: () => pointer({ v: 1, rev: shellRev(fragment) }) });
    expect(r.requested).toEqual([`${SHELL_DIR}current.json`]);
    expect(r.zag.dataset['navRev']).toBe(shellRev(fragment));
  });

  it.each([
    ['a 404', () => pointer({}, 404)],
    ['a network error', () => new Error('offline')],
    ['another contract version', () => pointer({ v: 2, rev: 'aaaaaaaaaaaa' })],
    ['a rev of the wrong shape', () => pointer({ v: 1, rev: '../../x' })],
    ['a pointer that is not JSON', () => ({ ok: true, json: () => Promise.reject(new SyntaxError('bad')) })],
  ])('keeps the baked header on %s, without an error', async (_, current) => {
    const r = await run({ current });
    expect(r.requested).toEqual([`${SHELL_DIR}current.json`]);
    expect(text(trigger(r.root))).toBe(label);
  });

  it.each(['http://localhost:4323', 'https://preview.example.b-cdn.net', 'https://notocx.sh'])(
    'stays off on %s: no request, so no 404 in the console',
    async (origin) => {
      const r = await run({ origin, current: () => pointer({ v: 1, rev: 'aaaaaaaaaaaa' }) });
      expect(r.requested).toEqual([]);
    },
  );

  it.each(['ocx.sh', 'next.ocx.sh', 'index.ocx.sh'])('runs on %s', (host) => {
    expect(SHELL_HOST.test(host)).toBe(true);
  });
});
