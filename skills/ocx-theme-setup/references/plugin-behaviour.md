# Plugin behaviour in detail

You loaded this file because you are about to override something the
`ocxTheme()` plugin sets, or a themed build looks wrong.

Contents: [Overrides](#overrides) · [Merge rules](#merge-rules) ·
[Fonts](#fonts) · [Search merge](#search-merge) · [Build output](#build-output)

## Overrides

The plugin maps each of these Starlight component slots to
`@ocx-sh/theme/starlight/<Name>.astro`. A key in your own `components`
replaces the theme's for that slot only.

| Slot | What the theme's version does |
|---|---|
| `Head` | Starlight's head plus preloads of the four core font files, and `html[data-platform]` set before paint (Kbd reads it) |
| `Header` | Brand, sections, ecosystem mega-menu, install button, GitHub and theme icons; rendered at build time from `nav.json` |
| `Footer` | `nav.json` footer links, licence and copyright line |
| `PageTitle` | Breadcrumb trail (the `breadcrumbs` option) and the H1; nothing on a `template: splash` page, which supplies its own `<h1 id="_top">` (with a `hero`, Starlight renders it) |
| `TableOfContents` | Adds "edit this page" and "report an issue" links; its one script also defines the phone TOC element |
| `MobileTableOfContents` | Starlight's markup with no script of its own (one request fewer before interaction) and its styles in `starlight.css` |
| `ThemeSelect` | Icon toggle (a CycleButton) shared with the mobile menu. The glyph shows the current state (sun while light, moon while dark), right at first paint. A switch crossfades the page (a view transition, `--ocx-duration-moderate`); under reduced motion, or without the API, it flips at once. It sets `html[data-theme]` and `html.dark`; a choice that equals the OS scheme is stored as `auto`, and a page with no pinned choice follows OS changes live |
| `ThemeProvider` | Inline pre-paint theme script, no markup |
| `MobileMenuFooter` | Icon theme toggle inside the mobile menu |
| `MarkdownContent` | Wraps every page body |
| `Search` | Search dialog on Zag, Pagefind UI loaded on first open; its script also mounts nav menu, mobile drawer, sidebar groups (one delegated controller) and toaster |
| `Sidebar` | Grouped sidebar; nested groups are plain markup toggled by one delegated controller (no Zag machine per group), loaded on the first touch of the sidebar |
| `MobileMenuToggle` | The mobile menu button |
| `PageFrame` | Header, sidebar pane and main layout |

Overriding `Search`: the warning text names the fix. Call
`mountChrome(document)` from `@ocx-sh/theme/chrome` in your override's `<script>`. Without it
the header nav and the mobile menu fall back to native popovers, nested
sidebar groups render open, no toast ever shows and the outline's current
marker never fades.

Overriding `TableOfContents`: the plugin warns too. The phone outline element is defined by the theme's
`TableOfContents.astro` script, so render `@ocx-sh/theme/starlight/TableOfContents.astro` inside your override,
or the phone outline stays a blank heading with no Escape or outside click.

Chrome overrides you write must not import a styled Starlight component: its
stylesheet would inline into every page. Style Starlight markup from your own
`customCss` instead.

## Merge rules

| Setting | Rule |
|---|---|
| `customCss` | Theme files first, then yours in your order. Yours is outside the `ocx` cascade layer, so a plain rule of yours beats any theme rule without `!important` |
| `components` | Theme map, then your keys on top |
| `expressiveCode` | `false` keeps code blocks unthemed. An object merges over the theme's; `styleOverrides` and `styleOverrides.frames` merge one level deep; `shiki.langs` concatenates (the theme adds an Elvish grammar plus injections that scope commands, flags and bare arguments in PowerShell, fish and Elvish as sh does) and `shiki.langAlias` merges (the theme maps `starlark`, `bzl` and `bazel` to Python) |
| `pagefind` | `false` stays `false`. Otherwise the theme's `mergeIndex` list comes first; your entries are appended unless their `bundlePath` is already there |
| `vite.build.assetsInlineLimit` | Theme inlines CSS files under 1024 bytes only when you have not set this |
| client code splitting | Theme groups the every-page modules into one chunk only when you set no `codeSplitting` or `manualChunks` of your own |
| `vite.optimizeDeps.include` | Theme adds its lazily loaded Zag machines and the asciinema player; your list is kept |

## Fonts

The plugin registers two families through the Astro Fonts API, from the package's own
generated subsets of the latin Plex files (`src/fonts/`):

| Family | Weights | CSS variable |
|---|---|---|
| IBM Plex Sans | 400, 600 | `--ocx-font-sans` |
| IBM Plex Mono | 400, 600 | `--ocx-font-mono` |

Only a small core is registered and preloaded: four files, 39 KB together, with ASCII
and common punctuation (`· © “ ” ‘ ’ – — … × − ↑ ↓` and the no-break space; `® ™ ° •` load on demand). The rest of latin lives in
the `OCX Plex Sans Rest` and `OCX Plex Mono Rest` families (`fonts/rest.css`, imported by
`base.css`, never preloaded). They follow Plex in the font stacks, so a character outside
the core renders in Plex once its rest file arrives. Kerning cannot span the boundary
between a core and a rest glyph. The files are generated: change the core list in
`packages/theme/scripts/generate-fonts.mjs`, run `pnpm --filter @ocx-sh/theme fonts` and
commit; never edit `src/fonts/` by hand. The guard `scripts/css/core-glyphs.mjs` fails a
built page whose text needs a rest character, so the core grows on purpose.

`fonts.css` and the Starlight path ship latin; other scripts (Cyrillic, Greek, Vietnamese, extended Latin) render in the system font.
Frac, dnom and numr (diagonal fractions) are not in the subsets.

Fallbacks follow the Rest family and lead with the metric-matched `OCX Sans Fallback` and
`OCX Mono Fallback` faces from `base.css`, so the swap causes no layout shift.
Use the variables, never a family name. Do not add a third family: every
font file counts against the page weight budget. Only upright faces ship:
an `<em>` renders the browser's synthesized oblique, because the true Plex Sans
italic is ~25 KB per weight and one `<em>` would push a content page past the
147 KiB weight budget. Never add `styles: ['italic']` or a `font-style: italic`
`@font-face`.

## Search merge

Each section builds its own Pagefind bundle at `<claim>pagefind/`. The plugin
adds one `mergeIndex` entry per other claim with `search: true`:
`{ bundlePath: '<claim>pagefind/', mergeFilter: { section: '<label>' }, indexWeight: 1 }`.
The label is the claim's ecosystem entry, section or hub label. A section
that is not deployed yet simply contributes no results.

## Build output

The injected integration also:

- sets `site: 'https://ocx.sh'`;
- injects `/favicon.svg` from the logo when neither `public/favicon.svg` nor
  Starlight's `favicon` exists;
- registers the route middleware that computes the breadcrumb trail into
  `starlightRoute.ocxTrail`;
- serves the plugin options to that middleware as `virtual:ocx-theme/options`.

The theme reads these Starlight files by path (no export key), so Starlight is pinned to the peer range and a build fails naming it if one moved: `utils/navigation.js`, `components-internals/TableOfContents/{starlight-toc.js,TableOfContentsList.astro}`, `user-components/Icon.astro`.
