// The consumer sites that get a preview build: one full Starlight site each, wearing @ocx-sh/theme, built from
// the docs `task samples` caches. Read by fetch.ts (what to pull), build.ts (what to build), the Astro config
// (title, redirects) and the example's "Live previews" page (cards), so a site added here appears everywhere.

/**
 * @typedef {object} PreviewSite
 * @property {string} name cache directory under `.tmp/samples/` and `.tmp/previews/`, and the `task previews` argument
 * @property {string} repo `owner/name` on GitHub
 * @property {string} dir docs directory inside the repo (sparse-checked-out)
 * @property {string} title site title (`<title>` suffix)
 * @property {string} blurb one sentence for the live-previews card
 * @property {string} mount claim path the site deploys to on ocx.sh (a `nav.json` claim); the preview redirects it to `/`
 * @property {string} [home] landing route, set only when the docs tree has no index page
 */

/** @type {readonly PreviewSite[]} */
export const SITES = [
  {
    name: 'ocx',
    repo: 'ocx-sh/ocx',
    dir: 'website/src/docs',
    title: 'ocx docs',
    blurb: 'The ocx command line: guides, in-depth chapters and reference.',
    mount: '/docs/',
    home: '/getting-started/',
  },
  {
    name: 'rules_ocx',
    repo: 'ocx-sh/rules_ocx',
    dir: 'docs',
    title: 'rules_ocx',
    blurb: 'Bazel rules and a module extension that provision tools through ocx.',
    mount: '/integrations/bazel/',
  },
  {
    name: 'python-sdk',
    repo: 'ocx-sh/ocx-sdk-python',
    dir: 'docs',
    title: 'ocx-sdk for Python',
    blurb: 'Resolve and install ocx packages from Python: guide and API reference.',
    mount: '/integrations/python/',
  },
  {
    name: 'catalog',
    repo: 'ocx-sh/catalog',
    dir: 'docs',
    title: 'OCX catalog',
    blurb: 'Render OCX package indices into a browsable static site.',
    mount: '/apps/catalog/',
  },
];

/** Host label of a site: DNS labels have no underscore, `rules_ocx` is `rules-ocx`. */
export const slug = (/** @type {PreviewSite} */ site) => site.name.replaceAll('_', '-');

/** Where the site is planned to be hosted (no hosting exists yet). */
export const previewUrl = (/** @type {PreviewSite} */ site) => `https://${slug(site)}.preview.ocx.sh`;

/**
 * The site a CLI argument names, by name or slug.
 * @param {string} arg
 */
export function findSite(arg) {
  const site = SITES.find((s) => s.name === arg || slug(s) === arg);
  if (!site) throw new Error(`unknown preview site "${arg}"; known: ${SITES.map((s) => s.name).join(', ')}`);
  return site;
}
