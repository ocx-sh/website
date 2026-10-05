<!-- doc_type: explanation -->

# Handover: ocx-sh/website

Start here. This repo is the home of the unified OCX web presence: one site at
`ocx.sh`, hosted on Bunny, assembled from many repos that each deploy their own
path — with one look, one header, one search. Decisions below were settled with
the owner on 2026-09-27 and amended on 2026-09-30. The reasoning trail is in
`docs/research/`, `.agents/adr/` (ADR 0001 architecture, ADR 0002 phase 2) and in
`ocx/.agents/discussions/unified-web-presence.md` (parked, superseded by this file).

## First steps in this repo

1. Read [`AGENTS.md`](AGENTS.md) for the working rules and commands. Skills and
   rules come from `grimoire.toml`; install them with `grim install`.
2. Phase 1 (the library) shipped as `v0.1.0`. Phase 2 (root site, Bunny as code,
   deploy action, cutover runbooks) is in progress.
3. Touch no consumer repo before its phase-3 plan exists.

## What this repo holds

| Path | What |
|---|---|
| `packages/theme/` | npm package `@ocx-sh/theme` — the shared library, see below |
| `site/` | root site: landing `/`, ecosystem hubs `/integrations/`, `/apps/`, `/install/` (Astro + Starlight) |
| `.github/actions/deploy/` | reusable action every consumer calls to deploy its path to Bunny |
| `infra/bunny/` | Bunny as code: zones, edge rules, `legacy.json`, the owner-local `bunny:*` tasks |
| `infra/cutover/` | cutover verification (`cutover:verify`) and the owner runbook for the `ocx.sh` move |
| `skills/ocx-theme-*` | grim skills that teach agents the library, the deploy action and the design rules |
| `examples/`, `scripts/previews/` | the showcase site and the consumer preview builds |

## Decisions

- **One domain, path-mounted.** `/` landing, `/docs/`, `/catalog/`,
  `/integrations/<x>/`, `/apps/<x>/`, `/install/`. Each path is its own build
  from its own repo. Sections not yet migrated are served by Bunny edge rules
  from their current hosts until each one moves.
- **Redirects.** `index.ocx.sh` stays the index host: only its HTML paths redirect
  to `/catalog/`, its JSON paths keep serving. `dev.ocx.sh` is untouched. GitHub
  Pages cannot send a 301, so each Pages repo gets a stub (meta refresh, canonical,
  `location.replace`).
- **Header**: three sections `docs · catalog · ecosystem`; integrations and apps
  live in an ecosystem mega-menu; install is a small outlined button; GitHub and
  theme toggle are icons (design draft, 2026-09-27).
- **Generators: Astro + Starlight everywhere.** Exception for phase 1: the
  catalog stays on `@ocx-sh/catalog` (VitePress) wearing the shared tokens; its
  Astro port (Vue components as islands) comes later.
- **Header is rendered at build time** — an Astro component overriding
  Starlight's `Header`, fed by `nav.json`. No header JS, no layout shift.
- **`nav.json` ships inside the library.** A nav change is a library release;
  Dependabot carries it to every consumer. Its v4 shape is `sections`, `hubs`,
  `claims`, `entries`, `actions` and `footer`. `claims` is the path registry,
  including `/schemas/` (owned by `ocx-sh/ocx`).
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
  HTML, then prune stale HTML only. Stale non-HTML goes through the owner's
  `task bunny:gc`. CI never purges: the account key stays local. No atomic swap
  on Bunny; this order means a visitor sees old or new, never broken.
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
| `@ocx-sh/theme/starlight` | Starlight plugin: injects CSS, overrides `Header`/`Footer`, derives `pagefind.mergeIndex` from the claims, validates `base` |
| `@ocx-sh/theme/vitepress` | CSS only (code blocks, dark hook); the catalog renders the header from `nav.json` in its own layout |
| `ocx-site` (bin) | `ocx-site check` rejects a built site whose root-relative links fall outside its claims |

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
  that derived steps follow; one cascade layer `ocx` (`@layer starlight, ocx;`)
  so a consumer's unlayered rule wins;
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
| `ocx-sh/ocx` `website/` | `/docs/`, `/schemas/` | VitePress 2 alpha → Cloudflare Pages (`deploy-website.yml`) | Starlight (45 pages, 9 code-groups) | `@ocx-sh/theme/starlight` |
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

Every consumer adds a Dependabot entry for the theme and one for the pinned
deploy action:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /website        # wherever package.json lives
    schedule: { interval: weekly }
    cooldown: { default-days: 7 }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
    cooldown: { default-days: 7 }
```

Open: auto-merge theme PRs on green CI, so a nav change lands in hours, not
whenever someone merges.

## CI and Bunny

References that already work — copy, don't reinvent:

- `www-setup/deploy/bunny/README.md`, `www-setup/scripts/lib/bunny.sh`,
  `www-setup/deploy/bunny/edge-rules.py` (setup.ocx.sh: Storage Zone
  `sh-ocx-setup`, Pull Zone `6415130`).
- `michael-herwig/Taskfile.yml` — Astro build → mirror → purge on Bunny.

Bunny is managed as code (ADR 0002): zero-dependency Node `.mjs` under
`infra/bunny/`, run locally with the account key (`BUNNY_API_KEY`, a
gitignored `.env` read only by the write tasks, never CI). Edge rules derive
from the `nav.json` claims plus one committed `legacy.json`. Apply is a diff
keyed by an `ocx:<id>` description, then a read-back, so a rollback never
passes through an empty rule set.

Topology:

- One HTTP-API storage zone per deploying repo, `sh-ocx-<repo>` (the root site
  uses `sh-ocx-website`), routed behind the pull zones by `OriginStorage` rules.
  S3-enabled zones are not used.
- Two pull zones over the same storage: `sh-ocx-dev` (`sh-ocx-dev.b-cdn.net`,
  `noindex`, edge-rule staging) and `sh-ocx` (prod, adds `ocx.sh` and the
  rehearsal host `next.ocx.sh`, `noindex`).
- Previews: a pull and a storage zone per site, `sh-ocx-preview-<slug>`, served at
  `https://sh-ocx-preview-<slug>.b-cdn.net/`; `<slug>.preview.ocx.sh` later.
- Secrets: one storage key per repo in that repo's environment. The root site
  uses `BUNNY_STORAGE_KEY` in `ocx.sh`; previews use `BUNNY_PREVIEW_KEY_<SLUG>`
  in `previews`. `task bunny:onboard` sets them over stdin.

Bunny facts that bite:

- Edge Storage is directory-backed: a path is a file or a directory, never both.
- **50 edge rules per pull zone** (5 triggers × 5 patterns per rule). Budget them:
  asset cache, `noindex`, HSTS, `X-Frame-Options`, the legacy proxies and
  redirects, one `OriginStorage` rule per migrated repo. The plan ceiling is 40
  and apply refuses when live plus planned rules exceed 50.
- Directory index is native, the 404 is each zone's `bunnycdn_errors/404.html`,
  and SPA fallback is a per-zone setting. None costs a rule.
- No atomic swap; geo-replication lag has no completion API.
- Cache purge per path / CDN tag, owner-local only.

The reusable action (`.github/actions/deploy`) is called from each consumer.
Its inputs are `path` (a claim path, default the repo's claim), `dist` (build dir)
and `storage-key`, plus `preview`, `dry-run` and `force-prune`. The consumer's
build emits Pagefind. Steps: validate `dist` → upload hashed and non-HTML files →
upload the fixed-name Pagefind files and HTML → prune stale HTML only. No purge.

It is a `node24` `.mjs` action. Consumers run it on `push: main`, a daily
`schedule` and `workflow_dispatch`. They pin its full SHA with a `# vX.Y.Z`
comment, because no floating major tag exists.

Apex cutover: DNS stays on Cloudflare and Bunny DNS is never used. `ocx.sh` is
served today by hetzner1 nginx, which proxies HTML to `ocx-website.pages.dev` and
the OCI registry (`/v2/`, the token realm) to JFrog. It serves nothing else. The
sequence is staged and owner-gated, in `infra/cutover/README.md`:

1. The dev zone comes up on its `b-cdn.net` host, with no DNS change (OG-D).
2. The prod zone `sh-ocx` takes `ocx.sh` as a hostname by Seamless Domain
   Migration, a certificate with no traffic change (OG-P).
3. nginx `location /` switches its upstream from `pages.dev` to `sh-ocx`. The
   registry stays on nginx and rollback is a reload (OG-N).
4. At the end of 2026, once the registry has left hetzner1, the apex becomes a
   DNS-only CNAME to `sh-ocx.b-cdn.net` (OG-C); hetzner1 retires later (OG-T).

Rehearsal (ADR 0002 Amendment 2): `next.ocx.sh` is a DNS-only CNAME straight to
Bunny, the end-state host, and the nginx hop is rehearsed on a throwaway
`edge.ocx.sh` vhost. The agent edits the hetzner1 nginx config itself (never
`*/data/`, never `sshd_config`). Whether the registry's `/v2/` leaves nginx
earlier, which would replace step 3 with a direct apex flip, is still open.

## Guideline + lore skills

The integration knowledge ships as grim skills from `skills/ocx-theme-*` in this
repo. They publish to `ghcr.io/ocx-sh/lore/<name>` (listed in `publish.toml`),
beside the existing docs-* skills. Each `vX.Y.Z` tag publishes them at that
version. A change to a component, option or the deploy action updates the
matching skill in the same commit.

- **`ocx-theme-setup` and `ocx-theme-deploy`** cover a repo joining the site.
  Pick the claim path (it must exist in `nav.json`), install `@ocx-sh/theme`, set
  Astro `base`, add the Starlight plugin, wire the deploy action and the
  Dependabot entries, and run `ocx-site check`. The consumer table above is their
  seed. No separate `ocx-site-integration` skill exists.
- **Design rules** live in `skills/ocx-theme-theming/references/design-rules.md`.
  No separate `ocx-design` rule exists. Coral is the only interactive
  colour; `accent-fg` for small text on light; mono for nav/labels/identifiers,
  sans for sentences; 13px UI density vs 15.5px prose; square corners, 2px max
  on large surfaces; shadows only on floating surfaces; tokens only, never raw
  values; override colour twice.

## Phases

0. Repo + `grim init` + skills (done).

1. **Library** — tokens, `base.css`, `nav.json`, Starlight plugin, VitePress
   adapter, tests, `@ocx-sh/theme` on npm (done, `v0.1.0`).
2. **Root site + Bunny as code + deploy action**: dev zone, prod zone, previews
   and the nginx upstream switch (OG-N). In progress.
3. Consumers onto the library: docs, rules_ocx, SDK, catalog tokens, lore
   `customCss`; Dependabot everywhere. Each section's legacy edge rule goes in
   its migration PR.
4. Redirects (index.ocx.sh HTML paths, Pages stubs) + apex DNS cutover (OG-C,
   end of 2026).
5. Catalog Astro port.

## Open questions

- Auto-merge policy for theme Dependabot PRs.
- Pagefind across the catalog: index generated package pages, or keep the
  catalog's own `search_index.json` and bridge it?

Closed: `lore.ocx.sh` stays a subdomain, and hetzner1 nginx serves only the
HTML proxy and the OCI registry for `ocx.sh`.

## Done means

- `@ocx-sh/theme` published; a test release opens Dependabot PRs in every consumer.
- Lighthouse CI at 100/100/100/100 on representative pages of every section.
- One search box returns hits from every section with correct URLs.
- Link check (lychee) passes across sections; old URLs keep resolving, with a
  301 or 302 where a path moved.
- `cutover:verify` is green against `ocx.sh` through the public path.
- A deploy never serves HTML that references a missing asset.
