// Page chrome overrides: Footer (C-026), PageTitle breadcrumbs (C-025),
// TableOfContents links (C-027), and the menu focusout close (C-023; WP14 Menu.astro uses it,
// the header's ecosystem menu is Zag's since Z9).
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import nav from '../src/nav.json' with { type: 'json' };
import { claimFor } from '../src/nav.mjs';
import { closeOnFocusOut } from '../src/starlight/menu-focusout.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
const load = async (name: string): Promise<Component> =>
  ((await import(`../src/starlight/${name}.astro`)) as { default: Component }).default;

const t = Object.assign((key: string) => key, { all: () => ({}) });
let container: AstroContainer;

async function render(name: string, pathname: string, route: Record<string, unknown> = {}): Promise<Document> {
  const html = await container.renderToString(await load(name), {
    request: new Request(`https://ocx.sh${pathname}`),
    locals: {
      t,
      starlightRoute: {
        entry: { data: { title: 'Page title' } },
        toc: undefined,
        editUrl: undefined,
        pagination: {},
        dir: 'ltr',
        ...route,
      },
    } as unknown as App.Locals,
  });
  return new JSDOM(html).window.document;
}

beforeAll(async () => {
  container = await AstroContainer.create();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('C-026 Footer', () => {
  it('C-026: keeps Starlight prev/next pagination above the footer line (owner review)', async () => {
    const doc = await render('Footer', '/docs/x/', {
      dir: 'ltr',
      pagination: {
        prev: { href: '/docs/a/', label: 'A', isCurrent: false, type: 'link', attrs: {}, badge: undefined },
        next: undefined,
      },
    });
    expect(doc.querySelector('.pagination-links a[rel="prev"]')?.getAttribute('href')).toBe('/docs/a/');
  });

  it('C-026: renders a <footer class="ocx-footer">', async () => {
    expect((await render('Footer', '/docs/x/')).querySelector('footer.ocx-footer')).not.toBeNull();
  });

  it('C-026: renders every nav.json footer link, in order', async () => {
    const links = [...(await render('Footer', '/docs/x/')).querySelectorAll('footer a')];
    expect(links.map((a) => [a.textContent.trim(), a.getAttribute('href')])).toEqual(
      nav.footer.map((l) => [l.label, l.href]),
    );
  });

  it('C-026: separator between links is exactly "·" (U+00B7, no spaces)', async () => {
    const doc = await render('Footer', '/docs/x/');
    const links = [...doc.querySelectorAll('footer a')];
    for (const a of links.slice(0, -1)) {
      let between = '';
      for (let n = a.nextSibling; n && n !== a.nextElementSibling; n = n.nextSibling) between += n.textContent ?? '';
      expect(between).toBe('·');
    }
    expect(links[0]?.parentElement?.textContent).toBe(nav.footer.map((l) => l.label).join('·'));
  });

  it('C-026: one licence line "Apache-2.0 · © <year> The OCX Authors"', async () => {
    const doc = await render('Footer', '/docs/x/');
    const line = `Apache-2.0 · © ${new Date().getFullYear()} The OCX Authors`;
    const matches = [...doc.querySelectorAll('footer *')].filter((el) => el.textContent.trim() === line);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(doc.querySelector('footer')?.textContent.split('Apache-2.0')).toHaveLength(2);
  });
});

describe('C-025 PageTitle', () => {
  const trail = [
    { label: 'ocx.sh', href: '/' },
    { label: 'docs', href: '/docs/' },
    { label: 'Guides' },
    { label: 'Page title' },
  ];

  it('C-025: the breadcrumb trail sits immediately before the H1, current page last, no divider', async () => {
    const doc = await render('PageTitle', '/docs/x/', { ocxTrail: trail });
    const h1 = doc.querySelector('h1');
    expect(h1?.textContent.trim()).toBe('Page title');
    const nav = h1?.previousElementSibling;
    expect(nav?.matches('nav.ocx-ui-crumbs[aria-label="Breadcrumbs"]')).toBe(true);
    expect(
      [...(nav?.querySelectorAll('ol > li:not(.ocx-ui-crumbs__more)') ?? [])].map((li) => li.textContent.trim()),
    ).toEqual(trail.map((c) => c.label));
    expect(nav?.querySelector('[aria-current="page"]')?.textContent.trim()).toBe('Page title');
    expect(doc.querySelector('hr, [role="separator"]')).toBeNull();
  });

  it.each([
    ['empty (splash, breadcrumbs: false)', []],
    ['current page only', [{ label: 'Page title' }]],
    ['missing (route middleware not run)', undefined],
  ])('C-025: trail %s → no nav, H1 still rendered', async (_, ocxTrail) => {
    const doc = await render('PageTitle', '/docs/x/', { ocxTrail });
    expect(doc.querySelector('nav')).toBeNull();
    expect(doc.querySelector('h1')?.textContent.trim()).toBe('Page title');
  });
});

// Starlight derives `starlightRoute.editUrl` from config `editLink.baseUrl`
// (undefined when unset), so the route's editUrl stands in for the config here.
describe('C-027 TableOfContents', () => {
  const linkByText = (doc: Document, text: string) =>
    [...doc.querySelectorAll('a')].find((a) => a.textContent.trim() === text);

  it('C-027: "edit this page ↗" links editUrl when editLink.baseUrl is set', async () => {
    const editUrl = new URL('https://github.com/ocx-sh/rules_ocx/edit/main/docs/x.md');
    const doc = await render('TableOfContents', '/integrations/bazel/x/', { editUrl });
    expect(linkByText(doc, 'edit this page ↗')?.getAttribute('href')).toBe(editUrl.href);
  });

  it('C-027: no "edit this page ↗" without editLink.baseUrl', async () => {
    const doc = await render('TableOfContents', '/integrations/bazel/x/');
    expect(linkByText(doc, 'edit this page ↗')).toBeUndefined();
  });

  it.each(['/docs/x/', '/integrations/bazel/x/', '/', '/unknown/'])(
    'C-027: %s always renders "report an issue ↗" → github.com/<claim.repo>/issues/new',
    async (pathname) => {
      const repo = claimFor(nav, pathname)?.repo;
      expect(repo).toBeTruthy();
      const doc = await render('TableOfContents', pathname);
      expect(linkByText(doc, 'report an issue ↗')?.getAttribute('href')).toBe(`https://github.com/${repo}/issues/new`);
    },
  );
});

describe('C-023 mobile menu sections', () => {
  it('C-023: MobileMenuFooter lists docs, each ecosystem hub and install, aria-current per C-007', async () => {
    const hubs = nav.hubs.map((h) => [h.label, h.href]);
    const doc = await render('MobileMenuFooter', '/integrations/bazel/x/');
    const links = [...doc.querySelectorAll('nav.ocx-mobile-sections a')].map((a) => [
      a.textContent.trim(),
      a.getAttribute('href'),
    ]);
    expect(links).toEqual(expect.arrayContaining([['docs', '/docs/'], ...hubs, ['install', '/install/']]));
    expect(
      [...doc.querySelectorAll('nav.ocx-mobile-sections [aria-current="page"]')].map((a) => a.getAttribute('href')),
    ).toEqual(['/integrations/']);
  });

  it('C-023: MobileMenuFooter carries its own ecosystem menu trigger (the header one is hidden at ≤ 640px)', async () => {
    const doc = await render('MobileMenuFooter', '/docs/');
    const triggers = doc.querySelectorAll('nav.ocx-mobile-sections button[popovertarget]');
    expect([...triggers].map((b) => [b.getAttribute('type'), b.textContent.trim()])).toEqual([['button', 'ecosystem']]);
    // C-192: it names the panel the Header renders (outside the nav root, so `mount` keeps it).
    const panel = (await render('Header', '/docs/')).querySelector('.ocx-mega[popover]');
    expect(panel?.id).toBeTruthy();
    expect(triggers[0]?.getAttribute('popovertarget')).toBe(panel?.id);
  });
});

describe('C-023 mega-menu focusout close', () => {
  function setup() {
    const { window } = new JSDOM(
      '<div id="panel" popover><a id="inside" href="#">in</a><button id="inside2">in 2</button></div><a id="outside" href="#">out</a><button id="trigger" popovertarget="panel">menu</button>',
    );
    vi.stubGlobal('Element', window.Element); // the module runs in the page's realm, where Element is global
    const doc = window.document;
    const panel = doc.getElementById('panel') as HTMLElement;
    const hidePopover = vi.fn();
    panel.hidePopover = hidePopover; // jsdom has no Popover API
    closeOnFocusOut(panel);
    const leave = (to: Element | null) =>
      doc
        .getElementById('inside')
        ?.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: to }));
    return { doc, hidePopover, leave };
  }

  it('C-023: focus moving outside the panel hides it', () => {
    const { doc, hidePopover, leave } = setup();
    leave(doc.getElementById('outside'));
    expect(hidePopover).toHaveBeenCalledOnce();
  });

  it('C-023: focus moving within the panel keeps it open', () => {
    const { doc, hidePopover, leave } = setup();
    leave(doc.getElementById('inside2'));
    expect(hidePopover).not.toHaveBeenCalled();
  });

  it('C-023: focus moving to the panel trigger keeps it open (the click toggles it)', () => {
    const { doc, hidePopover, leave } = setup();
    leave(doc.getElementById('trigger'));
    expect(hidePopover).not.toHaveBeenCalled();
  });

  it('C-023: focus leaving to nowhere (relatedTarget null) keeps it open (light dismiss covers it)', () => {
    const { hidePopover, leave } = setup();
    leave(null);
    expect(hidePopover).not.toHaveBeenCalled();
  });
});
