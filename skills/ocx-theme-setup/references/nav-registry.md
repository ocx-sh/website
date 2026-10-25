# The path registry (`nav.json`)

You loaded this file because a site needs a new path on `ocx.sh`, or you are
reading the registry from code.

## Shape

`@ocx-sh/theme/nav.json` (schema `nav.schema.json` in the theme repo) holds
`brand`, `sections` (a link, or a menu over `hubs`), `hubs`, `claims`, `entries`, `actions` and `footer`.
The header, the footer, the breadcrumb trail, the search merge, `ocx-site
check` and the deploy action all read this one file. A site bakes its nav at
build time, so a nav change reaches it in two ways:

- **Nav data** (labels, links, hubs, panels, new top-level sites) reaches every
  adopted site at runtime through `/_shell/` (see below), within about a minute
  of a website deploy and with no rebuild.
- **Markup, CSS and behaviour** (a new class, a new part, a Zag change) still
  need a theme release, which reaches each site through its Dependabot update.

A claim is `{ "path": "/integrations/bazel/", "repo": "ocx-sh/rules_ocx", "search": true }`:

- `path` is the directory the repo deploys to and the Astro `base`.
- `repo` is the only repository allowed to deploy there.
- `search: true` means the site builds a Pagefind bundle that every other
  section merges.

## Path grammar

`validate(nav)` enforces it:

- top-level sections are one of `docs`, `catalog`, `install`, `schemas`,
  `integrations`, `apps`, `team`, `learn`, plus the root `/`;
- hub children are one slug deep: `/integrations/<slug>/`, `/apps/<slug>/`,
  slugs matching `[a-z0-9]+(-[a-z0-9]+)*`, at most 32 characters;
- `repo` matches `ocx-sh/<name>`;
- reserved names such as `_astro` and `_shell` are not claimable; the root claim also owns
  `/_astro/`, `/_shell/` and `/pagefind/` (`ROOT_DIRS`).

## Helpers (`@ocx-sh/theme/nav`)

| Export | Returns |
|---|---|
| `validate(nav)` | Problems (`{ at, message }[]`), empty when valid |
| `claimFor(nav, path)` | The longest claim owning `path` |
| `claimsOf(nav, repo)` | Every claim `repo` deploys |
| `zoneName(repo)` | The Bunny storage zone: `ocx-sh/rules_ocx` → `sh-ocx-rules-ocx` |
| `mergeTargets(nav, ownPath)` | The search bundles a section merges |
| `activeSection(nav, pathname)` | The header section id for a URL |
| `installHref(nav)` | The install guide's root-relative URL, `/install/` |
| `catalogHref(nav, pkg?)` | The catalog's root-relative URL; with `pkg` (`nodejs/node`, no registry, no tag) that package's page, `/catalog/nodejs/node/` |
| `externalLink(href)` | `{ out, attrs }`: `out` shows the external icon, `attrs` is `target="_blank"` and `rel="noopener noreferrer"` for an external `http(s)` href, `{}` for an internal or `mailto:` one |
| `PAGEFIND_VERSION` | The Pagefind version the theme was built against |

## A pinned hub

A hub may carry `"pinned": true`: its rail entry sits at the bottom of the menu's rail
(the mobile menu lists it like any hub). It is an ordinary hub (`href`, `blurb`, `all`, categories,
entries), so `solutions` shows `more` with category `learn` and the Shorts and Podcasts entries.
It must be the only pinned hub, and the last one of its section. An entry `href` is a claim path or
lies under a claim other than `/`; `validate` reports anything else. A path that needs only a menu
link takes an entry in a hub, not a section. A hub whose `all` text starts with its label (`more` / `more to learn →`)
shows the rest as screen-reader text in both mobile menus (Starlight and Shell), so a bare "more" never fails Lighthouse's link-text audit. `all` is the hub link's name; only the trailing `→` is dropped.

## The shared header (`/_shell/`)

Theme 0.3.0 and later. The root site's deploy publishes the current header as a fragment; every
adopted site keeps its baked header and swaps in the live one after load when the two differ.

- `/_shell/v1/current.json` is `{"v":1,"rev":"<12 hex>"}`, cached 60 s. `rev` is the first 12 hex of
  the SHA-256 of the fragment bytes.
- `/_shell/v1/<rev>/nav.html` is the fragment, cached for a year. Each swappable part sits in a
  `<template data-shell-part="<name>">`; the names are the `SHELL_PARTS` constant (`sections`, `mega`, `drawer`), the one source for the
  build step and the loader. Links are root-relative.
- `SiteHeader` carries `data-nav-rev`, the rev of the nav baked into that page.
- `mountChrome(document)` fetches `current.json` once the page is idle. Equal revs: nothing more.
  Different revs: it fetches the fragment, checks its parts and swaps them while the nav menu is
  still idle. The loader then re-applies the active section and the current page, and leaves the
  site's own slots (search, `extraNav`) alone. Any failure keeps the baked header.
- v1 markup may use only the classes and parts that ship in the theme release carrying the loader.
  An incompatible change goes to `/_shell/v2/` with a theme release.

What the swap never reaches: visitors without JavaScript, crawlers, the script-sandboxed
`/catalog/p/*` pages, and a page whose theme predates 0.3.0 (it has no loader). A site gets the
loader by bumping `@ocx-sh/theme` to 0.3.0 once; after that its nav data follows the website.

A daily job in `ocx-sh/website` (`scripts/shell-drift.mjs`, called from `site.yml`) fetches one page
per claim, compares `data-nav-rev` with `current.json` and keeps one open issue listing the sites
that differ. A page with no `data-nav-rev` counts as stale. Fix a listed site by bumping the theme
in its repo and redeploying.

## Adding a section

1. Open a pull request on `ocx-sh/website` adding the claim, and an
   `entries` item if it belongs in the ecosystem menu.
2. After the theme release, install it in the new repo and set `base` to the
   claim path. Existing sites show the new section's menu entry through `/_shell/` without a rebuild.
3. Ask the owner to onboard the Bunny storage zone (see `ocx-theme-deploy`).
