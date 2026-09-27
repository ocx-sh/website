# Handover: ocx-sh/website

Start here. This repo is the home of the unified OCX web presence: one site at
`ocx.sh`, hosted on Bunny, assembled from many repos that each deploy their own
path — with one look, one header, one search. Decisions below were settled with
the owner on 2026-09-27; the reasoning trail is in `docs/research/` and in
`ocx/.agents/discussions/unified-web-presence.md` (parked, superseded by this file).

## First steps in this repo

1. `grim init`, then load the TypeScript / Astro skills and the docs skills
   (`docs-plan`, `docs-review`, `docs-instrument` from `ghcr.io/ocx-sh/lore`).
2. Create the GitHub repo `ocx-sh/website` and push (nothing is pushed yet;
   no commit exists yet either).
3. Build the library (Phase 1 below) before touching any consumer.

## What this repo holds

| Path (proposed) | What |
|---|---|
| `packages/theme/` | npm package `@ocx-sh/theme` — the shared library, see below |
| `site/` | root site: landing `/`, ecosystem hubs `/integrations/`, `/apps/`, `/install/` (Astro + Starlight) |
| `.github/actions/deploy/` | reusable action every consumer calls to deploy its path to Bunny |
| `docs/` | integration guide for consumer repos (source for the lore skill, see below) |

## Decisions

- **One domain, path-mounted.** `/` landing, `/docs/`, `/catalog/`,
  `/integrations/<x>/`, `/apps/<x>/`, `/install/`. Each path is its own build
  from its own repo. Old subdomains and GitHub Pages URLs redirect (301).
- **Header**: three sections `docs · catalog · ecosystem`; integrations and apps
  live in an ecosystem mega-menu; install is a small outlined button; GitHub and
  theme toggle are icons (design draft, 2026-09-27).
- **Generators: Astro + Starlight everywhere.** Exception for phase 1: the
  catalog stays on `@ocx-sh/catalog` (VitePress) wearing the shared tokens; its
  Astro port (Vue components as islands) comes later.
- **Header is rendered at build time** — an Astro component overriding
  Starlight's `Header`, fed by `nav.json`. No header JS, no layout shift.
- **`nav.json` ships inside the library.** A nav change is a library release;
  Dependabot carries it to every consumer.
- **Search**: each section builds its own Pagefind bundle at
  `/<section>/pagefind/`; Starlight's native `pagefind.mergeIndex` (with
  per-section `basePath`/`baseUrl`) merges them into one search. Upgrade path if
  cross-section ranking is poor: one central aggregate Pagefind pass.
- **Components**: Starlight built-ins (Tabs, Aside, Expressive Code) restyled
  onto the tokens, plus our own tested Astro components (ecosystem menu,
  combobox, dialog). **No Web Awesome** — the design draft still shows it;
  the cross-generator reason for it is gone.
- **Python SDK API reference**: `starlight-pydocs` (Griffe); fallback `griffe2md`.
- **Deploy**: per section, upload content-hashed `_astro/*` assets first, then
  HTML, then delete stale files, then purge that section's cache. No atomic
  swap on Bunny; this order means a visitor sees old or new, never broken.
- **Quality bar**: Lighthouse 100 in all four categories; shared components in
  TypeScript with tests; clean, high-quality design.
- **Scope**: OCX properties only. grimoire (grimoire.rs) is a different product;
  its token *pattern* is reused, not its site.

## The library: `@ocx-sh/theme`

One npm package, subpath exports, generator-agnostic core plus a Starlight plugin:

| Export | Content |
|---|---|
| `@ocx-sh/theme/tokens.css` | values only (`--ocx-*`), light on `:root`, dark on every generator's dark selector |
| `@ocx-sh/theme/base.css` | generator-agnostic styling: header, prose, focus, chips, cards |
| `@ocx-sh/theme/nav.json` | sections, ecosystem entries, external links — the path registry |
| `@ocx-sh/theme/starlight` | Starlight plugin: injects CSS, overrides `Header`/`Footer`, sets `pagefind.mergeIndex`, fixes base-path links |
| `@ocx-sh/theme/vitepress` | thin adapter for the catalog until its Astro port |

### Token sources to reconcile

- `ocx-catalog/src/theme/styles/tokens/{palette,type,shape}.css` + `base.css`,
  `docs-prose.css` — already `--ocx-*` (108 colour vars); the live foundation
  at index.ocx.sh.
- Design draft `theme/ocx-tokens.css` v1.2 (claude.ai design project
  `550606f7-5b74-4164-b5e9-6a2e5b27cafe`, "OCX website consolidation project")
  — evolved from the catalog tokens: prose/display scales, sharp shape system,
  coral as the only interactive colour, on-accent = ink `#1b2129` (5.4:1).
  **Draft, still being refined** — also holds `OCX Design Guide`, `OCX
  Components`, `OCX Site Mocks`, `theme/header/nav.json`,
  `theme/astro/OcxHeader.astro`. Read via the DesignSync tool (`/design-login`).
- Pattern to copy from `grimoire-indexer` (`docs/reference/theme-tokens.md`,
  `src/renderer/astro/styles/tokens.css`): namespaced tokens; **colour is the
  only per-scheme family** (override twice: `:root` and dark); one radius knob
  that derived steps follow; a cascade layer so a consumer's plain rule wins;
  no per-component hook tokens; a reference page listing every token and every
  rename.

Draft items the library does **not** take over: mdBook and MkDocs adapters,
Web Awesome, fetching `nav.json` from `ocx.sh/theme/v1` at CI time.

### Tests

- Vitest + Astro Container API for Header/Footer/Search (the Container API is
  still experimental — pin Astro, expect churn).
- Playwright smoke on a fixture Starlight site built under a non-root `base`
  (known gaps: root-relative Markdown links, 404 route collision starlight#1080).
- Contrast check on the token pairs (coral on white fails below 18px — the
  guide mandates `accent-fg` for small text).

## Consumers

| Repo | Path on ocx.sh | Today | Target | Consumes |
|---|---|---|---|---|
| `ocx-sh/website` (this) | `/`, `/integrations/`, `/apps/`, `/install/` | — | Starlight | `@ocx-sh/theme/starlight` |
| `ocx-sh/ocx` `website/` | `/docs/` | VitePress 2 alpha → Cloudflare Pages (`deploy-website.yml`) | Starlight (45 pages, 9 code-groups) | `@ocx-sh/theme/starlight` |
| `ocx-sh/index` + `ocx-sh/catalog` | `/catalog/` | `@ocx-sh/catalog` (VitePress) → CF Pages, index.ocx.sh | phase 1 VitePress + tokens; later Astro | `@ocx-sh/theme/vitepress` |
| `ocx-sh/rules_ocx` | `/integrations/bazel/` | Stardoc Markdown, plain Jekyll → GH Pages | Starlight renders the Stardoc output | `@ocx-sh/theme/starlight` |
| `ocx-sh/ocx-sdk-python` | `/integrations/python/` | MkDocs Material + mkdocstrings → GH Pages | Starlight + `starlight-pydocs` | `@ocx-sh/theme/starlight` |
| `ocx-sh/catalog` own docs | `/apps/catalog/` | MkDocs Material → GH Pages | Starlight | `@ocx-sh/theme/starlight` |
| `ocx-sh/grimoire-lore` | lore.ocx.sh (open: keep or `/lore/`) | `grimoire-indexer` (Astro renderer) → GH Pages | same renderer, OCX tokens via its `customCss` | map `--grim-*` ← `--ocx-*` in one CSS file |
| `ocx-sh/www-setup` | setup.ocx.sh — **stays**, serves raw scripts + `dist.json` | Bunny (live) | unchanged; `/install/` links to it | — |
| find_ocx, setup-ocx, ocx-mirror, ocx-mirror-sdk, vscode-ocx, ocx-indexbot, ocx-mcp | `/integrations/<x>/` or `/apps/<x>/` when they get docs | no site | cards in the ecosystem hubs first | `@ocx-sh/theme/starlight` |

mdBook: no repo uses it today. If one ever does, it gets CSS only
(`tokens.css` + `base.css` pulled from the npm tarball in CI) and no Dependabot
tracking unless CI installs the package via npm.

Every consumer adds a Dependabot entry:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /website        # wherever package.json lives
    schedule: { interval: daily }
    groups:
      ocx-theme: { patterns: ["@ocx-sh/theme"] }
```

Open: auto-merge theme PRs on green CI, so a nav change lands in hours, not
whenever someone merges.

## CI and Bunny

References that already work — copy, don't reinvent:
- `www-setup/deploy/bunny/README.md`, `www-setup/scripts/lib/bunny.sh`,
  `www-setup/deploy/bunny/edge-rules.py` (setup.ocx.sh: Storage Zone
  `sh-ocx-setup`, Pull Zone `6415130`).
- `michael-herwig/Taskfile.yml` — Astro build → mirror → purge on Bunny.

Target layout: one Storage Zone + one Pull Zone for `ocx.sh`; each section owns
the directory named by its path. Bunny facts that bite:
- Edge Storage is directory-backed: a path is a file or a directory, never both.
- **20 edge rules per pull zone** — budget them: directory index, per-section
  404, SPA fallback (catalog), redirects for index.ocx.sh and every GitHub Pages
  URL. Use path-segment variable expansion to keep rules generic.
- No atomic swap; geo-replication lag has no completion API.
- Cache purge per path / CDN tag.

The reusable action (`.github/actions/deploy`), called from each consumer:
inputs `section` (path), `dist` (build dir); steps: run Pagefind on `dist` →
upload `_astro/**` → upload HTML → delete files absent from `dist` → purge the
section. Credentials: org-level Bunny secrets scoped to the deploy.

Apex cutover: `ocx.sh` is served today by hetzner1 nginx proxying to
`ocx-website.pages.dev`. Inventory what else that nginx serves, bring every
section up on a Bunny preview hostname, cut DNS last.

## Guideline + lore skill

Publish the integration knowledge to grimoire-lore (lore.ocx.sh, artifacts at
`ghcr.io/ocx-sh/lore/<name>`, authored in `ocx-sh/grimoire-lore`, listed in its
`publish.toml`), alongside the existing docs-* skills:

- **Skill `ocx-site-integration`** — for a repo joining the site: pick the
  path (must exist in `nav.json`), install `@ocx-sh/theme`, set Astro `base`,
  add the Starlight plugin, wire the deploy action and the Dependabot entry,
  run the checks below. The consumer table above is its seed.
- **Rule `ocx-design`** — the design rules: coral is the only interactive
  colour; `accent-fg` for small text on light; mono for nav/labels/identifiers,
  sans for sentences; 13px UI density vs 15.5px prose; square corners, 2px max
  on large surfaces; shadows only on floating surfaces; tokens only, never raw
  values; override colour twice.

Write the content in `docs/` here first; lore packages it.

## Phases

0. Repo + `grim init` + skills (this handover).
1. **Library** — reconcile tokens, `base.css`, `nav.json`, Starlight plugin,
   VitePress adapter, tests, publish `@ocx-sh/theme` to npm.
2. Root site + Bunny zone + deploy action, on a preview hostname.
3. Consumers onto the library: docs, rules_ocx, SDK, catalog tokens, lore
   `customCss`; Dependabot everywhere.
4. Redirects + apex DNS cutover.
5. Catalog Astro port.

## Open questions

- lore.ocx.sh: keep the subdomain or mount at `/lore/`?
- Auto-merge policy for theme Dependabot PRs.
- Pagefind across the catalog: index generated package pages, or keep the
  catalog's own `search_index.json` and bridge it?
- What else hetzner1 nginx serves for `ocx.sh`.
- No citable Lighthouse 100 for Starlight + Pagefind — measure a fresh
  template early.

## Done means

- `@ocx-sh/theme` published; a test release opens Dependabot PRs in every consumer.
- Lighthouse CI at 100/100/100/100 on representative pages of every section.
- One search box returns hits from every section with correct URLs.
- Link check (lychee) passes across sections; old URLs 301 to the new paths.
- A deploy never serves HTML that references a missing asset.
