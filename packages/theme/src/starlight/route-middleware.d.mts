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
export function groupPath(sidebar: Sidebar): string[];
/**
 * Breadcrumb trail of a page: root → section or hub → ecosystem entry → sidebar groups → the page.
 * Groups have no page, so they carry no href; a crumb linking the page itself is dropped.
 * @param {{ path: string, title: string, groups: string[], root?: Crumb | false | undefined }} page
 * @returns {Crumb[]}
 */
export function pageTrail({ path, title, groups, root }: {
    path: string;
    title: string;
    groups: string[];
    root?: Crumb | false | undefined;
}): Crumb[];
/**
 * The sidebar with its groups flattened into one level of links.
 * @param {Sidebar} sidebar
 * @returns {Sidebar}
 */
export function flattenSidebar(sidebar: Sidebar): Sidebar;
/**
 * @param {{ flatten?: boolean, breadcrumbs?: TrailOptions | false }} [options] `breadcrumbs: false` → no trail;
 *   no `root` → no root crumb.
 * @returns {import('@astrojs/starlight/route-data').RouteMiddlewareHandler}
 */
export function createOnRequest({ flatten, breadcrumbs }?: {
    flatten?: boolean;
    breadcrumbs?: TrailOptions | false;
}): import("@astrojs/starlight/route-data").RouteMiddlewareHandler;
export const onRequest: import("@astrojs/starlight/route-data").RouteMiddlewareHandler;
export type StarlightRouteData = import("@astrojs/starlight/route-data").StarlightRouteData;
export type Sidebar = StarlightRouteData["sidebar"];
export type Crumb = {
    label: string;
    href?: string | undefined;
};
export type TrailOptions = {
    root?: Crumb | false | undefined;
};
/**
 * route data as the overrides read it
 */
export type OcxRouteData = StarlightRouteData & {
    ocxTrail?: Crumb[];
};
