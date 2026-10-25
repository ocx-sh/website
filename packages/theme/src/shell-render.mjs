/// <reference path="./virtual.d.ts" />
// The live header's fragment (r10), rendered from the very components the header uses. Server-only
// (SiteHeader's frontmatter and the root site's endpoint); it imports a component, so Node cannot load it bare.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Fragment from './shell/Fragment.astro';

/** @type {Promise<string> | undefined} */
let rendered;

/**
 * `shell/Fragment.astro` as HTML, rendered once per process: every page's SiteHeader asks for its
 * rev, and the fragment depends on nav.json only.
 * ponytail: the memo outlives a nav.json edit in `astro dev`; restart the server (the live header is a prod feature).
 * @returns {Promise<string>}
 */
export function renderShell() {
  rendered ??= AstroContainer.create().then((c) => c.renderToString(Fragment));
  return rendered;
}
