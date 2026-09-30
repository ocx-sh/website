/// <reference path="./virtual.d.ts" />
// Starlight route middleware: computes the PageTitle breadcrumb trail into
// `starlightRoute.ocxTrail` (before any flattening drops the groups), and
// flattens the sidebar only when CSS cannot (off by default).
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import nav from '../nav.json' with { type: 'json' };
import { activeSection } from '../nav.mjs';

/** @typedef {import('@astrojs/starlight/route-data').StarlightRouteData} StarlightRouteData */
/** @typedef {StarlightRouteData['sidebar']} Sidebar */
/** @typedef {{ label: string, href?: string | undefined }} Crumb */
/** @typedef {{ root?: Crumb | false | undefined }} TrailOptions */
/** @typedef {StarlightRouteData & { ocxTrail?: Crumb[] }} OcxRouteData route data as the overrides read it */

/**
 * Labels of the sidebar groups holding the current page, outermost first; `[]` for a top-level page.
 * @param {Sidebar} sidebar
 * @returns {string[]}
 */
export function groupPath(sidebar) {
  for (const entry of sidebar) {
    if (entry.type === 'link') continue;
    if (entry.entries.some((e) => e.type === 'link' && e.isCurrent)) return [entry.label];
    const inner = groupPath(entry.entries);
    if (inner.length) return [entry.label, ...inner];
  }
  return [];
}

/**
 * Breadcrumb trail of a page: root → section or hub → ecosystem entry → sidebar groups → the page.
 * Groups have no page, so they carry no href; a crumb linking the page itself is dropped.
 * @param {{ path: string, title: string, groups: string[], root?: Crumb | false | undefined }} page
 * @returns {Crumb[]}
 */
export function pageTrail({ path, title, groups, root }) {
  const hub = nav.hubs.find((h) => path.startsWith(h.href));
  const section = hub ?? nav.sections.find((s) => s.id === activeSection(nav, path));
  const entry = nav.entries.find((e) => e.href?.startsWith('/') && path.startsWith(e.href));
  /** @type {(Crumb | false | undefined)[]} */
  const crumbs = [
    root,
    section && { label: section.label, href: 'href' in section ? section.href : undefined },
    entry && { label: entry.label, href: entry.href },
    ...groups.map((label) => ({ label })),
  ];
  return [...crumbs.filter(/** @returns {c is Crumb} */ (c) => !!c && c.href !== path), { label: title }];
}

/**
 * The sidebar with its groups flattened into one level of links.
 * @param {Sidebar} sidebar
 * @returns {Sidebar}
 */
export function flattenSidebar(sidebar) {
  /** @param {Sidebar} entries @returns {Sidebar} */
  const links = (entries) => entries.flatMap((e) => (e.type === 'group' ? links(e.entries) : [e]));
  return sidebar.map((e) => (e.type === 'group' ? { ...e, entries: links(e.entries) } : e));
}

/**
 * @param {{ flatten?: boolean, breadcrumbs?: TrailOptions | false }} [options] `breadcrumbs: false` → no trail;
 *   no `root` → no root crumb.
 * @returns {import('@astrojs/starlight/route-data').RouteMiddlewareHandler}
 */
export function createOnRequest({ flatten = false, breadcrumbs = {} } = {}) {
  return defineRouteMiddleware(async (context, next) => {
    // Starlight types `locals.starlightRoute` in a global .d.ts only Astro projects load.
    const route = /** @type {{ starlightRoute: OcxRouteData }} */ (context.locals).starlightRoute;
    // The entry's type comes from `astro:content`, which lint cannot resolve outside an Astro project.
    const { data } =
      /** @type {{ entry: { data: { title: string, template?: string } } }} */ (/** @type {unknown} */ (route)).entry;
    // Splash pages (landing) carry no trail; PageTitle hides a trail of the current page alone.
    route.ocxTrail =
      breadcrumbs && data.template !== 'splash'
        ? pageTrail({
            path: context.url.pathname,
            title: data.title,
            groups: groupPath(route.sidebar),
            root: breadcrumbs.root,
          })
        : [];
    if (flatten) route.sidebar = flattenSidebar(route.sidebar);
    await next();
  });
}

// The plugin's options (index.mjs serves them). Loaded lazily so a dev server whose process predates
// the theme's Vite hook falls back to the defaults instead of failing every page.
const options = await import('virtual:ocx-theme/options').then(
  (m) => m.default,
  () => ({}),
);
export const onRequest = createOnRequest(options);
