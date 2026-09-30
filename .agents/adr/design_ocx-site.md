# System design: ocx.sh site

- Status: Proposed, with [ADR 0001](adr_0001_ocx-site-architecture.md)
- Date: 2026-09-27
- Scope: this repo (`@ocx-sh/theme`, `site/`, `.github/actions/deploy/`,
  Bunny-as-code, `docs/lore/`) plus the adoption contract that consumer repos follow.

Contents: [1 Path registry](#1-path-registry) · [2 Hosting on Bunny](#2-hosting-on-bunny) ·
[3 Deploy action](#3-deploy-action) · [4 Theme package](#4-theme-package-ocx-shtheme) ·
[5 Lore artifacts](#5-lore-artifacts) · [6 Gate matrix](#6-gate-matrix) ·
[7 Component contracts](#7-component-contracts) · [8 UX scenarios](#8-ux-scenarios)

---

## 1 Path registry

### 1.1 Grammar

```
path      = "/"                                   ; root claim: landing, top-level files, root build dirs (R5)
          | "/" top "/"                           ; top-level claim (owner decision, fixed set)
          | "/" hub "/" slug "/"                  ; ecosystem claim (any ocx-sh repo, via PR)
top       = "docs" | "catalog" | "install" | "schemas" | hub
hub       = "integrations" | "apps"
slug      = seg *("-" seg)   ; seg = 1*(a-z / 0-9); total ≤ 32 chars
```

`validate()` / `ocx-site check` enforce R1, R3–R5, R7, R8; R2 is a reviewer check.
R3/R4 are policy (two-way, changeable in a release); only published slugs are a
one-way door (ADR OW1).

| Rule | Statement |
|---|---|
| R1 | Every path starts and ends with `/`. Lowercase ASCII only |
| R2 | A slug names **what the user integrates with or uses** (`bazel`, `python`, `github-actions`), never the repo name (`rules_ocx`, `setup-ocx`). Reviewer check: CODEOWNERS on `nav.json` (C-010), not machine-checked |
| R3 | Adding a new `top` is an owner decision: a schema change and a minor release. Consumers claim only under a `hub` |
| R4 | A claim nests only directly under a hub claim. Nothing nests under `/docs/`, `/catalog/`, `/install/`, `/schemas/` or an ecosystem claim |
| R5 | The root claim `/` owns `/` itself, top-level **files** (`/favicon.ico`, `/logo.svg`, `/robots.txt`, `/404.html`) and the root site's own build dirs `/_astro/` and `/pagefind/` (the list `ROOT_DIRS` in `registry.mjs`; extending it is a registry change). It owns no other directory |
| R6 | REMOVED — version namespaces dropped (ADR Q2); `v<N>` stays reserved (R8) |
| R7 | One claim → one repo. One repo → one storage zone `sh-ocx-web-<name>`, where `<name>` is the repo name lowercased with `.` and `_` replaced by `-`. A repo may own several claims |
| R8 | Reserved: never a `top` or a `slug`: `_astro`, `pagefind`, `artifactory`, `bunnycdn_errors`, `.well-known`, `api`, `lore`, `team`, `preview`, and anything matching `v` 1*DIGIT [`.` 1*DIGIT] |
| R9 | REMOVED — registry clients only request `/v2/…`; site segments cannot collide with package namespaces |

### 1.2 Every current property → path

| Property | Repo | Path / host | Claim | `search` | Today | Cutover action |
|---|---|---|---|---|---|---|
| Landing | ocx-sh/website | `/` | root | yes (root bundle `/pagefind/`) | ocx.sh/ (ocx VitePress) | served by root zone |
| Integrations hub | ocx-sh/website | `/integrations/` | top (hub) | in root bundle | — | new |
| Apps hub | ocx-sh/website | `/apps/` | top (hub) | in root bundle | — | new |
| Install | ocx-sh/website | `/install/` | top | in root bundle | — | links setup.ocx.sh |
| Docs | ocx-sh/ocx | `/docs/` | top | yes | ocx.sh/docs/* (CF Pages) | same URLs; `/docs/x` served without redirect (F2) |
| JSON schemas | ocx-sh/ocx | `/schemas/` | top | no | ocx.sh/schemas/* | **must ship in the ocx deploy** (F6) |
| Team page | ocx-sh/ocx | `/docs/team/` | (inside /docs/) | yes | ocx.sh/team | edge rule #3: `/team` → 301 |
| Catalog | ocx-sh/index | `/catalog/` | top | no (default until the catalog emits a Pagefind bundle; flip `search`) | index.ocx.sh (HTML) | HTML redirect, see §2.6 |
| Package index | ocx-sh/index | host `index.ocx.sh` | none | — | CF Pages | **unchanged** (F5, OW2) |
| Bazel | ocx-sh/rules_ocx | `/integrations/bazel/` | ecosystem | yes | GH Pages | Pages stub |
| Python SDK | ocx-sh/ocx-sdk-python | `/integrations/python/` | ecosystem | yes | ocx-sh.github.io/ocx-sdk-python/ | Pages stub |
| Catalog app docs | ocx-sh/catalog | `/apps/catalog/` | ecosystem | yes | ocx-sh.github.io/catalog/ | Pages stub |
| CMake | ocx-sh/find_ocx | `/integrations/cmake/` | none yet (`planned` entry) | — | no site | claim when docs exist |
| GitHub Actions | ocx-sh/setup-ocx | `/integrations/github-actions/` | planned | — | — | nav.json v3 `/integrations/setup-ocx/` violates R2 → renamed |
| VS Code | ocx-sh/vscode-ocx | `/integrations/vscode/` | planned | — | — | — |
| Mirror | ocx-sh/ocx-mirror | `/apps/mirror/` | planned | — | — | — |
| Mirror SDK | ocx-sh/ocx-mirror-sdk | `/integrations/mirror-sdk/` | planned | — | — | — |
| Indexbot | ocx-sh/ocx-indexbot | `/apps/indexbot/` | planned | — | — | — |
| MCP server | ocx-sh/ocx-mcp | `/apps/mcp/` | planned | — | — | — |
| Lore | ocx-sh/grimoire-lore | `https://lore.ocx.sh/` | none (external entry) | — | CF Pages | stays (gate answer 2) |
| Setup scripts | ocx-sh/www-setup | `https://setup.ocx.sh/` | none (external) | — | Bunny (live) | unchanged |
| OCI registry | JFrog | `/v2/`, `/artifactory/api/docker/sh-ocx-oci-prod/` | reserved (R8) | — | nginx `~ /v2/` (unanchored, F4) → JFrog | **anchored** `^~` (§2.8 step 5); proxy bodies unchanged. Planned removal gates the DNS move (§2.8 step 8) |
| Dev site | ocx-sh/ocx | host `dev.ocx.sh` | none | — | nginx → CF Pages | staging: vhost → Bunny, noindex (§2.8 step 2) |

Note: setup.ocx.sh's pull zone also carries `/docs/*` and `/actions/*` upstream rules;
both targets 404 today. Out of scope here; the owner may delete them.

### 1.3 `nav.json` v4 (outline, full schema = `nav.schema.json`)

| Key | Shape | Purpose |
|---|---|---|
| `$schema` | `"./nav.schema.json"` | editor validation, offline. Shape only; cross-reference and uniqueness rules live in `validate()` |
| `version` | `4` (const) | shape version |
| `brand` | `{ wordmark, href }` | header brand (logo is a package asset, not a URL) |
| `sections[]` | `{ id, label, href }` or `{ id, label, hubs: [hubId…] }` | header sections (docs · catalog · ecosystem) |
| `hubs[]` | `{ id, label, href, blurb, all, categories: [{ id, label }] }` (≤ 4 categories) | mega-menu tabs + hub pages |
| `claims[]` | `{ path, repo, search }` | **the registry** |
| `entries[]` | `{ id, hub, category, label, meta, desc (≤ 60 chars), href?, planned? }` | menu items + hub cards |
| `actions[]` | `{ id, label, href, kind: "button" \| "icon" }` | install button, GitHub icon |
| `footer[]` | `{ label, href }` | footer links |

Dropped from v3: `subsites` (→ `claims` + `entries`), `menuItems` (→ `entries.category`),
`activeAlias` (derived), `menuRules` / `menuItemFields` (→ `ocx-design` rule + schema
descriptions), `generator`, `brand.logo`.

---

## 2 Hosting on Bunny

### 2.1 Request path

```
client ──▶ Cloudflare (DNS + proxy)
            ├─ dev.ocx.sh ──▶ hetzner1 nginx ──▶ https://ocx-sh.b-cdn.net  (SNI + Host, noindex)  (step 2: staging)
            ├─ ocx.sh ──▶ hetzner1 nginx
            │              ├─ ^~ /v2/, ^~ /artifactory/api/docker/sh-ocx-oci-prod/ ──▶ JFrog   (anchored, step 5)
            │              └─ /  ──▶ https://ocx-sh.b-cdn.net  (SNI + Host)                     (step 5 swap)
            ├─ index.ocx.sh ──▶ CF Pages (JSON unchanged; HTML → 301 ocx.sh/catalog/…)
            └─ lore.ocx.sh, setup.ocx.sh — unchanged
ocx-sh.b-cdn.net ──▶ Bunny pull zone `ocx-sh`
            edge rules ──▶ storage zone of the claim's repo (OriginStorage)
            default origin ──▶ sh-ocx-web-website
```

End state (§2.8 step 8, after the OCI registry is removed): `ocx.sh` is a DNS-only
CNAME to the pull zone; hetzner1 leaves the `ocx.sh` path.

### 2.2 Zones

| Zone | Kind | Purpose | Region |
|---|---|---|---|
| `ocx-sh` (hostname `ocx-sh.b-cdn.net`; `ocx.sh` added at §2.8 step 8) | Pull zone | the one public edge; origin = `sh-ocx-web-website` | — |
| `sh-ocx-web-website` | Storage | `/`, `/integrations/`, `/apps/`, `/install/` | FRA + setup's replication |
| `sh-ocx-web-ocx` | Storage | `/docs/`, `/schemas/` | same |
| `sh-ocx-web-index` | Storage | `/catalog/` | same |
| `sh-ocx-web-rules-ocx` | Storage | `/integrations/bazel/` | same |
| `sh-ocx-web-ocx-sdk-python` | Storage | `/integrations/python/` | same |
| `sh-ocx-web-catalog` | Storage | `/apps/catalog/` | same |
| one per future claiming repo | Storage | its claims | same |

Files are stored under the **full public path** (`sh-ocx-web-ocx/docs/index.html`).
That keeps the topology a two-way door (ADR D1.2). Storage zones are created
S3-enabled if P1 shows S3 zones work as `OriginStorage` targets (S3 is settable only
at creation).

### 2.3 Pull-zone settings (plan/apply/read-back, as www-setup)

| Setting | Value | Why |
|---|---|---|
| Edge cache time (default) | 60 s | freshness without purge (D1.3) |
| Browser cache time (default) | 0 (`no-cache`) | HTML always revalidates. F2's zone showed `max-age=2592000` on HTML, which must never happen here |
| `EnableOriginShield`, `EnableSafeHop`, `OriginRetries=2`, `OriginRetryDelay=1`, `OriginRetry5XXResponses` | on | www-setup PHX incident |
| `UseStaleWhileOffline`, `UseStaleWhileUpdating`, `EnableRequestCoalescing` | on | resilience. With origin shield, HTML staleness is ≈ 2 × TTL (~120 s); harmless because deploys never delete assets |
| `CacheErrorResponses` | off | never cache a 5xx |
| Monthly bandwidth limit | owner sets it | the reason for Bunny. Registry traffic is never on this zone (D1.4: the DNS move waits for registry removal) |
| Catalog zone "Rewrite 404 to 200" | only if the catalog keeps client-routed pages | per-zone SPA fallback, costs no rule |

### 2.4 Edge-rule budget (limit 50)

Hosts are always literal (`ocx.sh`, `ocx-sh.b-cdn.net`: nginx sends the latter as
Host until the DNS move). `*` never sits in the host
position except where matching every section is the intent (rules 1–2). www-setup
found that `*` is greedy across `/`, so `https://*/catalog/*` would also match
`/apps/catalog/`. Patterns are chunked at 5 per trigger. Rules are ordered longest
path first, and the first match wins.

| # | Rule | Trigger patterns | Action | Rules |
|---|---|---|---|---|
| 1 | Hashed assets, edge | `https://*/_astro/*` | Override Cache Time 31536000 | 1 |
| 2 | Hashed assets, browser | `https://*/_astro/*` | Override Browser Cache Time 31536000 | 1 |
| 3 | Legacy `/team` | `https://{ocx.sh,ocx-sh.b-cdn.net}/team`, `…/team/` | Redirect 301 `https://ocx.sh/docs/team/` | 1 |
| 4 | `ocx-sh/ocx` | `{2 hosts} × {/docs, /docs/*, /schemas/*}` (6 → 2 triggers) | OriginStorage `sh-ocx-web-ocx` | 1 |
| 5 | `ocx-sh/catalog` (before #6: longer path) | `{2 hosts} × {/apps/catalog, /apps/catalog/*}` | OriginStorage `sh-ocx-web-catalog` | 1 |
| 6 | `ocx-sh/index` | `{2 hosts} × {/catalog, /catalog/*}` | OriginStorage `sh-ocx-web-index` | 1 |
| 7 | `ocx-sh/rules_ocx` | `{2 hosts} × {/integrations/bazel, …/*}` | OriginStorage `sh-ocx-web-rules-ocx` | 1 |
| 8 | `ocx-sh/ocx-sdk-python` | `{2 hosts} × {/integrations/python, …/*}` | OriginStorage `sh-ocx-web-ocx-sdk-python` | 1 |
| 9–16 | reserve: one per planned repo (§1.2) | — | OriginStorage | 8 |
| — | Registry `/v2`, `/artifactory` | — | none. nginx routes them. 2 reserved only if DNS moves before registry removal (ADR D1.4 option 2) | 0 |
| — | Directory index, 404, SPA fallback | — | native / per-zone (F2) | 0 |
| | **Now: 8. Fully planned: 16. Ceiling: 50** | | | |

If P1 fails (fallback C), rules 4–16 become "Change Origin URL →
`https://sh-ocx-web-<repo>.b-cdn.net`" on each repo's own pull zone. The count is
unchanged.

### 2.5 Cache policy

| Content | Edge | Browser | Source |
|---|---|---|---|
| `<claim>_astro/**` (content-hashed) | 1 y | 1 y | rules 1–2 |
| HTML, `pagefind/**`, `sitemap*.xml`, `robots.txt`, JSON schemas, everything else | 60 s | `no-cache` | zone default. Cloudflare in front must pass it through: rule "Browser Cache TTL: respect existing headers" for hosts `dev.ocx.sh`, `ocx.sh` (§2.8 steps 2, 5), moot once `ocx.sh` is DNS-only |

### 2.6 Redirect inventory

| From | To | Where | Status |
|---|---|---|---|
| `index.ocx.sh/` and HTML paths | `https://ocx.sh/catalog/<path>` | Cloudflare single redirect rule. **Expression excludes `*.json`, `/p/*`, `/config.json`** | 301 |
| `ocx.sh/team` | `/docs/team/` | Bunny rule #3 | 301 |
| `ocx-sh.github.io/ocx-sdk-python/**` | `https://ocx.sh/integrations/python/**` | redirect stub in that repo's Pages | meta refresh + canonical + JS (Pages cannot 301, H15) |
| `ocx-sh.github.io/catalog/**` | `https://ocx.sh/apps/catalog/**` | same | same |
| rules_ocx GH Pages | `https://ocx.sh/integrations/bazel/**` | same | same |
| `ocx-website.pages.dev` | `https://ocx.sh/:splat` | `_redirects` in the last CF Pages deploy, after the 30-day rollback window | 301 |
| `ocx.sh/catalog*` → `index.ocx.sh` (today's `_redirects`) | removed | dies with the CF Pages upstream | — (loop hazard if both lived) |

### 2.7 Secrets

| Secret | Scope | Location | Set by |
|---|---|---|---|
| `BUNNY_STORAGE_KEY` | password of `sh-ocx-web-<repo>` | the repo's GitHub environment `ocx.sh` (deployment branches: `main`) | `task bunny:onboard` |
| `BUNNY_API_KEY` | account | owner's gitignored `.env` | owner. Never in CI |
| `LORE_ANNOUNCE_TOKEN` | GitHub App or fine-grained PAT, PR write on `ocx-sh/grimoire-lore` only | this repo's environment `lore` (deployment branches: `main`) | owner |

### 2.8 Cutover sequence

| Step | Action | Verify | Rollback |
|---|---|---|---|
| 0 | **M0**: owner runs P1 on S3-enabled scratch zones; P3 runs in the deploy WP | result + topology B/C recorded in the plan's M0 section | choose the fallback |
| 1 | `task bunny:onboard` for each claiming repo. Create pull zone `ocx-sh`. `task bunny:zone:apply`, `task bunny:apply` | `task bunny:verify` | delete zones |
| 2 | **Staging** (owner, on hetzner1): point the existing `dev.ocx.sh` vhost at Bunny with `infra/cutover/dev.nginx.conf` (below); Cloudflare rule "Browser Cache TTL: respect existing headers" for `dev.ocx.sh` | `task cutover:verify -- --host dev.ocx.sh` noindex check (C-054) | restore the old vhost |
| 3 | Each existing section deploys to production paths (reachable on `dev.ocx.sh`) | lychee cross-section. Merged search. S-003 | redeploy |
| 4 | Snapshot today's URL set (ocx VitePress `sitemap.xml` + `/schemas/**` + root files) into `infra/old-urls.txt` | `task cutover:verify -- --host dev.ocx.sh`: every URL returns 200 or 301 | fix the section |
| 5 | **Main site** (owner, once the sites are released on Bunny): apply `infra/cutover/nginx.conf` (below) on the `ocx.sh` vhost; the same Cloudflare rule for `ocx.sh` | `task cutover:verify -- --host ocx.sh` (C-054), then registry smoke (S-007) | revert the nginx edit (seconds); the anchor part may stay |
| 6 | `index.ocx.sh` HTML-only rule. Pages stubs merged in each consumer | C-043, lychee over old URLs | remove the rule |
| 7 | +30 days: retire CF Pages `ocx-website` (last deploy = `_redirects` 301) | — | — |
| 8 | **DNS move** (owner, after the OCI registry is removed): add hostname `ocx.sh` + certificate to pull zone `ocx-sh`; the Cloudflare `ocx.sh` record becomes a DNS-only CNAME to `ocx-sh.b-cdn.net` (the zone stays on Cloudflare, so the `index.ocx.sh` rule keeps working). Registry still live → first add the two ADR D1.4 option-2 edge rules (Change Origin URL + Set Host → JFrog) | `task cutover:verify -- --host ocx.sh` | restore the proxied hetzner1 record (DNS TTL) |

```nginx
# infra/cutover/dev.nginx.conf — step 2: `location /` of the existing dev.ocx.sh vhost
resolver 1.1.1.1 valid=60s;                               # re-resolve Bunny's rotating IPs
location / {
  set $bunny ocx-sh.b-cdn.net;                            # variable upstream forces runtime DNS
  proxy_pass https://$bunny;
  proxy_ssl_server_name on;
  proxy_set_header Host ocx-sh.b-cdn.net;
  add_header X-Robots-Tag "noindex, nofollow" always;     # staging is never indexed
}
```

```nginx
# infra/cutover/nginx.conf — step 5: ocx.sh vhost; replaces `location ~ /v2/` (unanchored: F4 live bug) and `location /`
resolver 1.1.1.1 valid=60s;
location ^~ /v2/                                  { <existing JFrog proxy body> }
location ^~ /artifactory/api/docker/sh-ocx-oci-prod/ { <existing JFrog proxy body> }
location / {
  set $bunny ocx-sh.b-cdn.net;
  proxy_pass https://$bunny;
  proxy_ssl_server_name on;
  proxy_set_header Host ocx-sh.b-cdn.net;
}
```

The anchor fix shipped 2026-09-27 (server-hetzner1 `66b2e22`): regex locations `~ ^/v2/(?:sh-ocx-oci-prod/)?(.*)`
and `~ ^/artifactory/api/docker/sh-ocx-oci-prod/v2/(.*)`, same JFrog proxy body. Step 5 only swaps `location /`.

---

## 3 Deploy action

`ocx-sh/website/.github/actions/deploy`, `runs.using: node24`,
`main: index.mjs`, which imports `deploy.ts` (probe P3). Zero runtime dependencies.
It reads `nav.json` and `registry.mjs` from its own checkout
(`$GITHUB_ACTION_PATH/../../../packages/theme/src/`).

### 3.1 Consumer job (the adoption template, shipped in the skill)

```yaml
on:
  push: { branches: [main] }
  schedule: [{ cron: "17 4 * * *" }]  # daily: a GITHUB_TOKEN auto-merge fires no push run
  workflow_dispatch:
# …
deploy:
  needs: build                      # build job uploads artifact "site" (dist incl. pagefind/)
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: { name: ocx.sh, url: "${{ steps.deploy.outputs.url }}" }
  concurrency: { group: ocx-sh-deploy, cancel-in-progress: false }
  permissions: {}
  steps:
    - uses: actions/download-artifact@<sha> # vN
      with: { name: site, path: dist }
    - id: deploy
      uses: ocx-sh/website/.github/actions/deploy@<sha> # vX.Y.Z
      with:
        dist: dist
        storage-key: ${{ secrets.BUNNY_STORAGE_KEY }}
```

### 3.2 Inputs / outputs

| Input | Required | Default | Meaning |
|---|---|---|---|
| `dist` | yes | — | build output. Its root maps to `path` |
| `storage-key` | yes (empty → exit 1; JS actions do not enforce `required`) | — | the repo's zone password |
| `path` | no | the repo's only claim. If the repo owns several claims, its shortest one | public path `dist` maps to: a claim the repo owns (HANDOVER's `section`, H16) |
| `storage-host` | no | `storage.bunnycdn.com` | regional endpoint |
| `dry-run` | no | `false` | list + plan, no writes |

| Output | Meaning |
|---|---|
| `url` | `https://ocx.sh<path>` |
| `uploaded` / `deleted` | file counts |

### 3.3 Steps

| # | Step | Writes? |
|---|---|---|
| 1 | Resolve repo (`GITHUB_REPOSITORY`), zone (`sh-ocx-web-<name>`), path. Validate the registry claim and a non-empty `storage-key` | no |
| 2 | Run the `ocx-site check` logic on `dist` (link, layout, Pagefind version). `dist/index.html` must exist. If `search`, `dist/pagefind/pagefind-entry.json` must exist | no |
| 3 | Recursive list of `<zone>/<path>` (GET per directory) | no |
| 4 | Phase 1: PUT every file **except** phase-2 files. Parallel (8), `Checksum` = SHA-256 uppercase hex, retry ×3 | yes |
| 5 | Phase 2: PUT `*.html`, the top-level files of `pagefind/` (fixed names: `pagefind.js`, `pagefind-entry.json`, `pagefind-ui.*`, wasm; its subdirs hold hashed chunks and stay in phase 1), and `404.html` → `<zone>/bunnycdn_errors/404.html` | yes |
| 6 | Prune: delete stale `*.html` (listed − uploaded, minus other claims' subtrees and `bunnycdn_errors/`). Stale non-HTML is never deleted by a deploy (owner `bunny:gc`, C-072) | yes |
| 7 | Step summary, outputs | no |

**Guarantee.** New assets exist before any new HTML. A deploy never deletes an asset,
so no cached HTML can reference a missing one. `bunny:gc` runs only far beyond any
TTL. The accepted residual is seconds of geo-replication lag, which self-heals
(research-domain-bunny).

### 3.4 Error cases

| Case | Behaviour | Site state |
|---|---|---|
| Repo owns no claim, `path` not owned, or empty `storage-key` | exit 1 at step 1. Zero requests | unchanged |
| Link/layout check fails | exit 1 at step 2, problems listed. Zero writes | unchanged |
| Missing `index.html` / pagefind entry | exit 1 at step 2 | unchanged |
| Bad key (401 on list) | exit 1 at step 3 | unchanged |
| PUT fails after 3 tries in phase 1 | exit 1. No phase 2, no prune | old HTML + old assets + some new assets: consistent |
| PUT fails in phase 2 | exit 1. No prune | each page is old or new, and every page's assets exist |
| DELETE fails in prune | exit 1 (warns which) | consistent. Stale HTML lingers until the next deploy |
| Concurrent deploy of the same repo | serialized by the consumer's `concurrency` group | — |

---

## 4 Theme package `@ocx-sh/theme`

### 4.1 Export map

| Export | File | Consumer |
|---|---|---|
| `./tokens.css` | `src/tokens.css` | all generators (the first file loaded; holds the layer order statement) |
| `./base.css` | `src/base.css` | all |
| `./fonts.css` | `src/fonts.css` | all |
| `./starlight.css` | `src/starlight/starlight.css` | plugin (by specifier) |
| `./starlight` | `src/starlight/index.mjs` (+ `types: index.d.mts`) | Starlight consumers |
| `./starlight/*.astro` | `src/starlight/{Header,Footer,PageTitle,TableOfContents,ThemeSelect,MobileMenuFooter}.astro` | plugin (by specifier) |
| `./components/*.astro` | `src/components/{EcosystemMenu,HubGrid}.astro` | root site + any Starlight page |
| `./nav.json` | `src/nav.json` | all |
| `./nav` | `src/nav.mjs` (+ `types: nav.d.mts`; re-exports `registry.mjs`) | catalog header, root site |
| `./vitepress` | `src/vitepress/vitepress.css` | catalog |
| `./logo.svg` | `src/logo.svg` | catalog, root site |
| `bin: ocx-site` | `bin/ocx-site.mjs` | consumers, deploy action |

JS is authored as `.mjs` + JSDoc (`tsc --checkJs`). `prepack` runs `tsc --allowJs
--declaration --emitDeclarationOnly` to emit each `.d.mts` (gitignored). `.astro` and
`.css` ship as source. `nav.schema.json` stays in the repo (editors, tests) and is not
exported. Dialog / Combobox are deferred (no in-scope consumer). `files: ["src",
"bin"]`. `peerDependencies: { "@astrojs/starlight": ">=0.42.0 <0.43", "astro": "^7" }`.
The upper bound exists because `starlight.css` targets Starlight internals
(discover-architecture). A Starlight minor bump arrives as a Dependabot PR against
this repo, runs the gate, and ships a theme release. First release: `1.0.0`.

### 4.2 Cascade layer order

```
@layer starlight, ocx;        /* first line of tokens.css */
```

| Priority (low → high) | Layer | Contents |
|---|---|---|
| 1 | `starlight.base` … `starlight.utils` | Starlight + Expressive Code (F3) |
| 2 | `ocx` | all of `tokens.css`, `base.css`, `starlight.css`, `vitepress.css`, and every theme `.astro` `<style>` |
| 3 | unlayered | the consumer's `customCss` / own styles: **always wins** |

Outside the layer: `@font-face` only. No `!important` anywhere in `src/`.

### 4.3 Plugin `ocxTheme()`, behaviour

| Aspect | Behaviour |
|---|---|
| Options | none |
| `base` | must equal a claim path, else the build fails, listing the claims |
| `site`, `trailingSlash` | set to `https://ocx.sh`, `'always'` (injected integration). A different explicit `site` fails the build |
| `customCss` | `fonts, tokens, base, starlight.css`, then the consumer's |
| `components` | the §4.4 overrides. Consumer keys win |
| `expressiveCode` | theme defaults (plain frame, no window dots, token-mapped syntax colours via a Shiki CSS-variables theme). Consumer `false` / keys win |
| `pagefind` | `mergeIndex` = `{ bundlePath: "<claim>pagefind/", mergeFilter: { section: "<label>" }, indexWeight }` for every claim with `search: true` except its own. `<label>` = the label of the claim's entry or section. `indexWeight` is one plugin constant (default 1), the knob if cross-section ranking is poor. Consumer `pagefind: false` is kept. Consumer entries are appended, deduped by `bundlePath` |
| Route middleware | `addRouteMiddleware` computes the eyebrow group label into `starlightRoute`; flattens `starlightRoute.sidebar` only if CSS cannot (§4.4) |
| Links | no rewrite (F9). `ocx-site check` enforces them |

### 4.4 Starlight overrides (mock fidelity, `.tmp/design/OCX Site Mocks`)

| Override | Kind | Mock | Delivers |
|---|---|---|---|
| `Header` | component (exists) | OcxHeader, #1a | brand, search (Starlight `Search`, lazy Pagefind kept), sections, ecosystem mega-menu (Popover API, `position: fixed` below the header, anchor positioning as progressive enhancement, tabs via CSS `:has()`, ~5-line `focusout` close script), install button, GitHub + theme icons. Coexists with Starlight's mobile `sl-sidebar-pane` popover at 390 px. Container queries 960 / 640 |
| `Footer` | component | #1a footer | nav.json `footer` + Apache-2.0 + © line, `contentinfo` |
| `PageTitle` | component | #1a/#1b | eyebrow breadcrumb (section or hub / sidebar group label from the route middleware) + H1 in the content column, no divider |
| `TableOfContents` | component (wraps default) | #1a | adds "edit this page ↗" (Starlight `editLink`) and "report an issue ↗" (`github.com/<claim.repo>/issues/new`) |
| `ThemeSelect` | component | OcxHeader | icon toggle, the one implementation shared by the header and the mobile menu |
| `MobileMenuFooter` | component | #1a mobile | icon toggle instead of the "Auto ▾" select. Header icons do not clip at 390 px |
| Sidebar | **CSS only** | #1b | mono-caps group labels, flat items, active = tint + coral text, no chevrons, no nested rules. If CSS cannot flatten it, the route middleware flattens `starlightRoute.sidebar` (cheaper than a `Sidebar` override) |
| Content measure, H2 rule, title spacing | CSS | #1b | `--sl-content-width` ≈ 675 px, top rule on each H2 section |
| Code groups | content convention | #1b | Starlight `<Tabs syncKey="shell">` (converters emit `.mdx`). EC frame = plain panel with copy icon |

### 4.5 Test surfaces

Vitest + the Astro Container API (`experimental_AstroContainer`) for every `.astro`
above. The vitest config uses `getViteConfig()` against an astro config that includes
Starlight, and tests pass `locals.starlightRoute`. `astro` is pinned exact in
devDeps. Astro 7 renders JSX-style whitespace, so C-025/C-026 assert the rendered
separator text. Tooling floor: prettier-plugin-astro ≥ 1.0, eslint-plugin-astro on
astro-eslint-parser v3. `registry.mjs` is table-driven. Playwright runs on the built
example under base `/docs/` (smoke, keyboard, mobile 390 px + popover coexistence,
search, cascade, axe with the menu open). Visual snapshots are deferred (ADR D5).

---

## 5 Lore artifacts

Authored in `docs/lore/` and published from this repo (ADR D4):

```
docs/lore/
  publish.toml                       # repository_prefix = "ocx-sh/lore"; [announce] → grimoire-lore
  rules/ocx-design.md                # index (≤ ~200 lines)
  rules/ocx-design/tokens.md         # GENERATED from packages/theme/src/tokens.css
  rules/ocx-design/header.md         # mega-menu + header rules (ex nav.json menuRules)
  skills/ocx-site-integration/SKILL.md
  skills/ocx-site-integration/references/{deploy-job.yml,dependabot.yml,automerge.yml,astro.config.example.mjs,pages-redirect/index.html,pages-redirect/404.html}
  docs/{ocx-design,ocx-site-integration}.md   # catalog readmes
```

### 5.1 Rule `ocx-design` (per edit)

Frontmatter: `paths` = `**/*.css`, `**/*.astro`, `**/*.vue`, `**/*.mdx`,
`**/astro.config.*`, `**/nav.json`. Plus `summary`, `keywords`, `license: Apache-2.0`,
`repository`.

| Section | Contains |
|---|---|
| The Gate | the commands that fail the build: `ocx-site check`, css-theming's three built-CSS scripts, `task lighthouse`. "Tokens are types": prose is secondary to these |
| Non-negotiables (table, IDs `OCX-DES-nn`) | OCX-specific values only: coral is the only interactive colour. `accent-fg` for small text on light. Mono for nav/labels/identifiers, sans for sentences. 13 px UI vs 15.5 px prose. Radius 0 / 2 px max on large surfaces. Shadows only on floating surfaces. Logo is coral-only, never recoloured, ≥ 16 px mark, wordmark lowercase Plex Mono 600 at 0.7×. Generic rows cite, never restate: tokens only → `css-theming` CSS-TOK-01; override colour twice → CSS-TOK-03 |
| Token reference | pointer to generated `tokens.md` (every token, role, both scheme values, renames) |
| Do / Don't pairs | ≥ 1 pair per OCX non-negotiable, as minimal CSS/markup snippets |
| Forbidden values | OCX-specific: `border-radius` > 2 px on surfaces, `box-shadow` on non-floating, font families other than the two tokens, coral on hover in the menu. Cited: literal colours → CSS-TOK-01; `!important` → CSS-CAS-03 |
| Header & ecosystem menu | `header.md`: 620 px panel, 168 px rail, 76 px strip, ≤ 4 categories × 6 items (5 + "n more →"), rail click switches tab, hover/focus only previews |
| Naming schema | path grammar §1.1 (R1–R8) + "run `ocx-site check`" |
| Cascade | **one line**: "layer mechanics: `css-theming` (CSS-CAS-02). This rule never restates them" |
| Severity + Siblings | MUST/SHOULD/CONSIDER. Siblings `css-theming`, `typescript-quality`, `docs-quality` |

### 5.2 Skill `ocx-site-integration` (once per repo)

Frontmatter: `name`, a trigger-rich `description` ("join ocx.sh", "adopt
@ocx-sh/theme", "deploy docs to ocx.sh", "migrate from GitHub Pages/MkDocs/VitePress
to ocx.sh"), `license`, `metadata.{summary,keywords}`.

| Step | Contains |
|---|---|
| 0 Preconditions | Node 24, pnpm or npm, Astro 7 + Starlight 0.42 (VitePress catalog only: CSS path) |
| 1 Claim a path | grammar §1.1, slug rule R2 (owner reviews it via CODEOWNERS). Open a PR to `ocx-sh/website` adding `claims[]` + `entries[]`. **Owner action**: merge, release, `task bunny:onboard -- <repo>` |
| 2 Install | `grim add ocx-design`. Add `@ocx-sh/theme` at the release that contains the claim |
| 3 Configure | `base` = claim, `plugins: [ocxTheme()]`, `editLink.baseUrl`. Do not set `site` / `trailingSlash` (the plugin does) |
| 4 Content | full root-relative links (`/docs/x/`), code groups as `<Tabs syncKey>`, no raw colours |
| 5 Deploy | `references/deploy-job.yml`: triggers `push: main` + daily `schedule:` + `workflow_dispatch`. Environment `ocx.sh`. SHA pins |
| 6 Dependabot | `references/dependabot.yml` (npm + github-actions, daily, no groups) + `automerge.yml` (patch/minor, Q1) |
| 7 Old URLs | `references/pages-redirect/` for GH Pages. An old custom host goes on the owner's action list |
| 8 Verify | `ocx-site check` green, local build, Lighthouse, deploy dry-run, then the live URL |
| Troubleshooting | table: symptom → cause (base mismatch, unclaimed link, missing pagefind, 401 key) |

---

## 6 Gate matrix

Every row is a Taskfile target. `task check` runs every row marked "in check". Each CI
job runs exactly one of those targets (`ocx exec -- task <name>`).

| Task | Tools | In `check` | CI job |
|---|---|---|---|
| `lint` | oxlint `--type-aware` (+ eslint-plugin-oxlint), typed ESLint + eslint-plugin-astro (astro-eslint-parser v3), actionlint, zizmor (pinned in `ocx.toml`) | yes | `lint` |
| `fmt` | `oxfmt --check` (ts, js, mjs, json, css, md, yaml), `prettier --check "**/*.astro"` (prettier-plugin-astro ≥ 1.0) | yes | `lint` |
| `typecheck` | `tsc --noEmit` (incl. `checkJs` for `*.mjs`), `astro check` (example, site) | yes | `typecheck` |
| `test` | Vitest (`getViteConfig()`; include `packages/**`, `scripts/**`, `infra/**`, `.github/actions/deploy/test/**`): registry, plugin config, Container API components, rules generator, deploy vs fake Bunny, lore sync | yes | `test` |
| `build` | `astro build` example (`/docs/`) + site (`/`) | yes | `build` (uploads dists) |
| `css` | outside-layers, literal-colours, dark-parity over `dist/**/*.css` + `*.html`; fails on a missing dist (C-071) | yes | `build` |
| `e2e` | Playwright on the downloaded dists: base smoke (incl. canonical, C-017), keyboard/menu, mobile 390 px + popover coexistence, search merge (second real bundle from `site/`) + degrade + older-Pagefind case, cascade probe (4 controls), axe with the menu open | yes | `e2e` (downloads dists) |
| `lighthouse` | `lhci autorun`, `staticDistDir` (example copied under `<tmp>/docs/`), fixture URLs, runs 3, median, assert 1 × 4. @lhci/cli 0.15.1 = Lighthouse 12.6 | yes | `lighthouse` (downloads dists) |
| `pack` | `prepack` (`.d.mts`), pack, publint, attw (JS exports), `publish --dry-run` guard, `strictest` fixture consumer, run bin. Self-contained: builds its own fixture | yes | `pack` |
| `docs` | markdownlint + lychee (offline) over `docs/`, `grim build` validate over `docs/lore/` | yes | `docs` |
| `secrets` | `gitleaks` (pinned in `ocx.toml`) over the working tree | yes | `repo-checks` |
| `theme:dev` (= `dev`) / `theme:test` | example live reload at :4321/docs/ / Vitest for the package | no / subset of `test` | — |
| `site:dev` / `site:test` | root site live reload / its build + e2e subset | no / subset | — |
| `deploy:dev` / `deploy:test` | action against a local fake Bunny with a real dist / Vitest for the action | no / subset | — |
| `lore:dev` / `lore:test` | `grim build` → install into a scratch project in `.tmp/` / the `docs` subset | no / subset | — |
| `bunny:plan` (dev) / `bunny:test` | render rules + settings offline / snapshot + budget test | no / subset | — |
| `bunny:apply`, `bunny:zone:apply`, `bunny:verify`, `bunny:onboard`, `bunny:purge`, `bunny:gc`, `bunny:cutover-verify` (root alias `cutover:verify`) | owner-local, `BUNNY_API_KEY` | no | — |
| `visual` | mock-vs-site pairs report, `--watch` | no | — |
| `visual:test` / `visual:update` | **deferred** (Docker snapshots) until the design draft stabilises | — | — |

---

## 7 Component contracts

Each contract can be tested from outside, without reading the implementation.

### Registry and `nav.json`

- **C-001** `nav.json` validates against the shape-only `nav.schema.json` (JSON Schema
  2020-12) and `validate(nav)` returns no problems. Every file in
  `packages/theme/test/fixtures/nav-invalid/` makes `validate()` return ≥ 1 problem,
  one fixture per rule C-002…C-006 (the schema need not reject them).
- **C-002** Path grammar (§1.1). `validate()` accepts `/`, `/docs/`, `/integrations/bazel/`.
  It rejects `/docs`, `/Docs/`, `/foo/`, `/integrations/`-children with `_`, slugs over
  32 chars, and `/docs/sub/`.
- **C-003** Reserved segments (R8) and version-shaped slugs (`v2`, `v1.3`) are rejected
  as `top` or `slug`.
- **C-004** Claim paths are unique. A claim under a non-hub claim is rejected. The root
  claim owns no directory except `ROOT_DIRS` (`/_astro/`, `/pagefind/`, R5).
- **C-005** `repo` matches `^ocx-sh/[A-Za-z0-9._-]+$`. `zoneName("ocx-sh/rules_ocx")` =
  `sh-ocx-web-rules-ocx`. Two repos that map to the same zone name are rejected.
- **C-006** Entries: `hub` exists. `category` ∈ that hub's categories. A hub has ≤ 4
  categories. `id` is unique per hub. An internal `href` equals a claim path.
  `planned: true` ⇔ no `href`. An external `href` is `https:`. `desc` ≤ 60 chars.
- **C-007** `activeSection(nav, pathname)`, table-driven: `/docs/x/` → `docs`;
  `/integrations/bazel/x/` and `/apps/` → `ecosystem`; `/install/` → `install`;
  `/` and `/unknown/` → `''`.
- **C-008** `registry.mjs` exports the pure functions `validate(nav): Problem[]`,
  `claimFor(nav, path)` (longest prefix), `claimsOf(nav, repo)`, `zoneName(repo)` and
  `mergeTargets(nav, ownPath)`. None performs I/O.
- **C-009** A test fails if `nav.json.version` differs from the schema's `version` const.
- **C-010** `.github/CODEOWNERS` assigns `packages/theme/src/nav.json` to the owner.

### Checker `ocx-site`

- **C-011** `ocx-site check [--dist <dir>] [--repo <owner/name>] [--path <p>]` exits 0 on
  pass, 1 with one `<file>: <problem>` line per problem, and 2 on a usage error. `--repo`
  defaults to `GITHUB_REPOSITORY`, else the `origin` remote.
- **C-012** A repo that owns no claim fails, and the message lists how to claim one.
- **C-013** Link check: every root-relative `href`, `src` and `srcset` URL in
  `dist/**/*.html` (hash and query stripped) resolves by longest prefix to a claim.
  Under the root claim, only `/`, top-level files and paths under `ROOT_DIRS` are
  allowed. Targets under the repo's own claim must exist in `dist` (a file, or a dir
  with `index.html`).
- **C-014** Layout check: every file in `dist`, mapped onto `--path`, must fall under a
  claim owned by the repo. For example, website's dist containing `integrations/bazel/`
  fails; its `_astro/` and `pagefind/` pass (R5); a top-level `foo/` fails.

### Theme package and plugin

- **C-015** `ocxTheme()` returns a Starlight plugin named `@ocx-sh/theme`. Passing an
  argument is a type error.
- **C-016** `base` not equal to a claim path → the build fails with a message containing
  the base and the claim list.
- **C-017** The built pages carry canonical `https://ocx.sh<path>` and trailing-slash
  URLs. A consumer `site` other than `https://ocx.sh` fails the build.
- **C-018** `customCss` order in the resolved config: fonts, tokens, base, starlight.css,
  then the consumer's.
- **C-019** The resolved `components` contain the §4.4 overrides. A consumer-set key keeps
  the consumer's value.
- **C-020** `pagefind.mergeIndex` equals the search claims minus the site's own, with
  `bundlePath` `<path>pagefind/`, `mergeFilter: { section: <label> }` (§4.3) and
  `indexWeight`. Consumer `pagefind: false` is preserved. Consumer entries are appended
  without duplicate `bundlePath`.
- **C-021** With one merged bundle returning 404, a query for a term present only in the
  own section returns that result. The UI shows no error dialog (P6).
- **C-022** Expressive Code: consumer `false` is preserved. Consumer keys override
  defaults. Default output shows no terminal window dots.
- **C-023** Header, rendered with JS disabled: all section links present,
  `aria-current="page"` per C-007. The ecosystem menu opens via `popovertarget`; closes
  on Esc, outside click, and focus leaving the panel; and works with the mobile menu
  open at 390 px. Clicking a rail item switches the tab. Hover/focus on an item shows its
  `desc` in the strip. Container widths >960 / >640 / ≤640 show full / icon search /
  menu button. axe reports no violations with the menu open.
- **C-024** Theme toggle: one component in the header and the mobile menu. A click flips
  `html[data-theme]` and writes `localStorage.starlight-theme`. It still flips when
  `localStorage` throws. It has an accessible name.
- **C-025** `PageTitle` renders the `Breadcrumbs` trail (`<nav aria-label="Breadcrumbs"><ol>`)
  immediately before the H1, with no divider element: root crumb (plugin option
  `breadcrumbs.root`, default `ocx.sh` → `/`), section/hub, ecosystem entry, the sidebar
  group chain (plain text, computed by the route middleware before any flattening), then the
  current page (`aria-current="page"`, no link, fg). A crumb linking the page itself is dropped;
  no trail on splash pages, with `breadcrumbs: false`, or when only the current page remains.
  Separator: the mock's "/", drawn by CSS with empty alt text.
- **C-026** `Footer` renders every nav.json `footer` link, an Apache-2.0 line and a ©
  line inside `contentinfo`. The rendered separator text between links equals the
  mock's, spaces included.
- **C-027** `TableOfContents` renders "edit this page ↗" only when `editLink.baseUrl` is set.
  It always renders "report an issue ↗" → `https://github.com/<claim.repo>/issues/new`.
- **C-028** Cascade probe (real Chrome, a fresh page per case) on the built example:
  a theme rule beats a Starlight rule on the same property; an unlayered consumer rule beats
  the theme rule; one inverted expectation fails when inverted; one dead-selector control
  stays at its UA value. Identity is encoded in the colour value.
- **C-029** Built-CSS gate over `dist/**/*.css` + inline `<style>` in `dist/**/*.html`:
  outside-layers prints only allowlisted entries; literal-colours prints only allowlisted
  third-party entries, each with a reason; dark-parity is symmetric. Each script has been
  watched going red on a planted violation.
- **C-030** Every token pair in `packages/theme/test/contrast-pairs.ts` meets 4.5:1 (text) or 3:1
  (large/UI) in both schemes.
- **C-031** The tarball's `exports` keys are exactly the §4.1 list, and each key resolves
  inside the installed tarball. Every JS export has a `types` condition whose `.d.mts`
  is in the tarball; no `.ts` source is in it.
- **C-032** Pack-smoke: publint and attw (JS exports) are clean; `npm publish --dry-run`
  output has no `auto-corrected`; the tarball installs with `--ignore-scripts` into a
  `mktemp -d` fixture Astro+Starlight site (base `/docs/`, `astro/tsconfigs/strictest`);
  `astro check` and `astro build` pass; `node_modules/.bin/ocx-site check` passes on its
  dist.
- **C-033** `vitepress.css` is entirely inside `@layer ocx` and contains no literal colours.
- **C-034** `./nav` exports `activeSection` and the C-008 functions; its generated
  `nav.d.mts` declares the `Nav` type.

### Deploy action

- **C-035** Inputs and outputs exactly as §3.2. `outputs.url` = `https://ocx.sh<path>`.
- **C-036** Against a fake Bunny that counts requests: any step-1/2 failure (§3.4
  rows 1–3) exits 1 with zero PUT/DELETE requests. An empty `storage-key` exits 1 with
  zero requests of any kind.
- **C-037** Request URLs have the form `https://<storage-host>/sh-ocx-web-<name>/<path without
  leading slash><file>`, and every request carries `AccessKey`.
- **C-038** No phase-2 request (`*.html`, top-level files of `pagefind/` such as
  `pagefind.js`, `pagefind-entry.json`, `pagefind-ui.*` and wasm, and
  `bunnycdn_errors/404.html`) starts before every phase-1 request has succeeded. Files
  under `pagefind/*/` are phase 1. Every PUT carries `Checksum` = uppercase SHA-256 hex
  of the body.
- **C-039** Network errors, 5xx and 429 are retried up to 3 attempts. Other 4xx responses are
  not retried. Once a request exhausts its attempts, the job exits 1 and no DELETE is sent.
- **C-040** `dist/404.html` is uploaded to `<zone>/bunnycdn_errors/404.html`.
- **C-041** Prune: stale `*.html` (listed − uploaded) is deleted. No DELETE is ever sent
  for a non-HTML file, whatever its `LastChanged`. Files under other claims and
  `bunnycdn_errors/` are never deleted.
- **C-042** REMOVED — version namespaces dropped (R6).
- **C-043** `task cutover:verify` asserts `https://index.ocx.sh/config.json` and one
  `/p/<ns>/<pkg>.json` return 200 `application/json` with no redirect. It fails otherwise.
- **C-044** `dry-run: true` issues only GET requests and prints the planned PUT/DELETE
  counts and paths.
- **C-045** The step summary contains the URL, counts and duration. The key never appears in
  logs, because it is masked on input.
- **C-046** Release: tag `vX.Y.Z` → the full gate → `npm publish --provenance` → `v1`
  moved. The first release is `v1.0.0`. The release fails if the `package.json` version
  ≠ the tag, checked by a unit-tested script. Publish is skipped when that exact version
  already exists on npm (the owner-bootstrapped `1.0.0`).

### Bunny as code

- **C-047** `task bunny:plan` needs no credentials, and its output is byte-identical
  across runs (snapshot test).
- **C-048** Generated rules: one OriginStorage rule per non-root claiming repo, with
  patterns over literal hosts only, ≤ 5 patterns per trigger, and ordered longest path first
  (a multi-claim repo's rule sorts by its longest claim path). The total is ≤ 40 (a
  10-rule safety margin under 50).
- **C-049** Rules 1–2 set 31536000 s edge and browser cache on `*/_astro/*`.
- **C-050** `task bunny:apply` replaces all rules and reads them back. `task bunny:verify`
  fetches every claim root on `ocx-sh.b-cdn.net` and asserts 200 and a canonical link equal
  to `https://ocx.sh<path>`.
- **C-051** `task bunny:zone:apply` sets §2.3, reads every value back and fails on any
  mismatch.
- **C-052** `task bunny:onboard -- <repo>` fails if the repo owns no claim. It is idempotent
  on an existing zone. It sets `BUNNY_STORAGE_KEY` in the repo's `ocx.sh` environment
  (branch policy `main`) without printing the key.
- **C-053** `task bunny:purge -- <path>` purges by prefix. It exits non-zero without a
  request when the `CI` environment variable is set.
- **C-054** `task cutover:verify -- --host <h>` (root alias of `bunny:cutover-verify`)
  asserts that every URL in `infra/old-urls.txt` returns 200 or 301;
  `/pagefind/pagefind.js` has a `cache-control` containing `no-cache`; and C-043 passes.
  With `--host dev.ocx.sh`, every response carries `X-Robots-Tag` containing `noindex`.
  With `--host ocx.sh` (dropped with the registry): `/v2/` returns 401 with the unchanged
  `Bearer realm` header; `/docs/v2/` does **not** return JFrog's 401; the token endpoint
  returns 200.

### Tasks

- **C-055** Each of `theme`, `site`, `deploy`, `lore`, `bunny` has a `:dev` and a `:test`
  target (`bunny:dev` = plan), asserted by parsing `task --list-all`.
- **C-056** `task check` runs every "in check" row of §6 and fails if any fails. Every `run:`
  line in `.github/workflows/ci.yml` is `ocx exec -- task <name>`, where `<name>` is one of those rows.
- **C-057** `task lighthouse` asserts score 1 in all four categories on the median of 3 runs
  for each listed URL (example, served from `<tmp>/docs/`: splash, long sample doc, code
  components, 404; site: landing, hub, install).
- **C-058** `task visual` writes `.tmp/visual/report.html` with one mock/site pair plus a diff
  per row of `tests/visual/pairs.ts`, and exits 0. A pair whose mock id is missing renders a
  "mock missing" row and the task still exits 0. `--watch` regenerates on source change.
- **C-059** `task dev` serves the example at `http://localhost:4321/docs/`. The served page
  contains the `.ocx-header` markup and reflects an edit to `packages/theme/src/**`
  without a restart.

### Lore

- **C-060** `rules/ocx-design.md` has frontmatter `paths` (§5.1), `summary`, `keywords`,
  `license: Apache-2.0` and `repository`. It contains every §5.1 section heading.
- **C-061** `rules/ocx-design/tokens.md` equals the generator output for the current
  `tokens.css`. A test fails if they differ.
- **C-062** Every line in `docs/lore/rules/**` that mentions `@layer`, `specificity`,
  `!important`, `literal colour`, `raw value` or dark parity also contains `css-theming`
  or a `CSS-` rule ID.
- **C-063** `SKILL.md` frontmatter has `name`, `description`, `license` and
  `metadata.{summary,keywords}`. It contains steps 0–8, and every file referenced under
  `references/` exists.
- **C-064** `references/deploy-job.yml` passes actionlint and zizmor, every `uses:` is
  SHA-pinned with a version comment, and `on:` has exactly `push` (branch `main`),
  `schedule` and `workflow_dispatch`.
- **C-065** `grim build` over `docs/lore/` exits 0. markdownlint and lychee pass.
- **C-066** `docs/lore/publish.toml`: every entry has `version` + `description.readme`,
  `repository_prefix = "ocx-sh/lore"` and `[announce].repository` = grimoire-lore. The
  publish workflow runs on `main` only, path-filtered to `docs/lore/**`.

### Root site

- **C-067** Hub pages list every entry of the hub under its category. `planned` entries are
  labelled and unlinked. External entries show ↗.
- **C-068** `/robots.txt` lists `https://ocx.sh<claim>sitemap-index.xml` for every claim
  with `search: true`.
- **C-069** `/404.html` (root zone, the global fallback) renders the header and search.

### Added in review

- **C-070** `ocx-site check` on a dist whose claim has `search: true` fails when the
  `version` in `dist/pagefind/pagefind-entry.json` differs from `PAGEFIND_VERSION`, the
  Pagefind version the theme release was tested with (a node-free literal constant,
  exported from `./nav` and loaded in the browser by the catalog — it holds no `node:`
  import). A test resolves the example's installed `pagefind` version via `createRequire`
  from `@astrojs/starlight`'s package directory (`pagefind` is not a direct dependency)
  and asserts it equals `PAGEFIND_VERSION`.
- **C-071** `css`, `e2e` and `lighthouse` exit non-zero with `missing dist: <dir>` when an
  expected dist is absent (never a silent pass on zero files).
- **C-072** `task bunny:gc -- --older-than <d>` (owner-local; exits non-zero when `CI` is
  set) deletes a non-HTML file only if its `LastChanged` is (a) older than `<d>` and
  (b) more than 1 h older than the claim's live `index.html` `LastChanged`, and skips
  any claim whose `index.html` is younger than 1 h. It never deletes HTML, files under
  other claims or `bunnycdn_errors/`. `--dry-run` lists without deleting.

---

## 8 UX scenarios

| ID | Actor → action | Expected outcome | Error cases |
|---|---|---|---|
| S-001 Owner live review loop | Owner runs `task dev` + `task visual -- --watch` and comments; the agent edits `packages/theme/src/*` | The example hot-reloads (<2 s). The report regenerates the affected pairs. `task check` is green before a commit | Samples missing → `task dev` fetches them. Mock id not found → that pair is shown as "mock missing", no crash |
| S-002 Consumer adopts the theme | An agent in `ocx-sh/ocx-sdk-python` runs skill `ocx-site-integration` | PR to website with a claim `/integrations/python/` → owner merges + releases + onboards → consumer PR: theme, plugin, base, deploy job, Dependabot → `ocx-site check` green → first deploy serves `https://ocx.sh/integrations/python/` | Slug violates R2 → the owner rejects it in review (CODEOWNERS on `nav.json`, C-010); C-002 catches only grammar violations. Theme version without the claim → C-016 build error naming claims. Missing secret → C-036 exit 1, zero writes |
| S-003 Section deploy with failure mid-upload | `ocx-sh/ocx` merges to main. The deploy loses the network during phase 1 | Job red at the PUT that exhausted its retries. The site keeps serving the previous version. Rerun (CI grant) → full deploy, prune | Phase-2 failure: pages are mixed old/new, each self-consistent. Prune failure: stale HTML lingers, the next deploy removes it |
| S-004 New integration path | Owner or agent adds a claim + entry for `/integrations/cmake/` (find_ocx) | website CI validates (C-001…C-006). Release `vX.Y+1.0` → `task bunny:onboard -- ocx-sh/find_ocx` → `task bunny:apply` (rule +1, C-048) → the card flips from planned to linked in each section as Dependabot lands | Budget exceeded → C-048 fails in CI before apply. Zone name collision → C-005 |
| S-005 Nav change propagates | Owner relabels a hub category in nav.json | One website PR → minor release → Dependabot opens PRs in every consumer (daily) → auto-merge on green (Q1) → each section redeploys on its daily `schedule:` run (a `GITHUB_TOKEN` merge fires no push run; C-064 asserts the trigger). Inside about 24 h every section shows the new label. The 24 h path is cross-repo and not testable in this repo | A consumer's CI red → its PR stays open, and that section shows the old nav (no-lockstep accepted, §Consequences) |
| S-006 Publish lore | A theme PR changes `tokens.css` and bumps `ocx-design` `version` | C-061 forces a regenerated `tokens.md` in the same PR → merge → publish workflow → `ghcr.io/ocx-sh/lore/ocx-design:<ver>` → announce PR into grimoire-lore → `grim update` in consumers picks it up | Version not bumped → `grim publish` skips (existing tag; grim behaviour, no contract here). Stale `tokens.md` → C-061 red |
| S-007 docker pull after cutover | A user runs `docker pull ocx.sh/nodejs/node:24` and `ocx install` after the `ocx.sh` nginx swap (§2.8 step 5) | Token from `ocx.sh/artifactory/…/token` (200), manifest + blobs from JFrog as before. No Bunny in that path | Any registry failure → revert the nginx line (seconds) and rerun C-054 |
| S-008 Old URL visit | A browser opens `https://ocx-sh.github.io/ocx-sdk-python/reference/client/` | The stub redirects to `https://ocx.sh/integrations/python/reference/client/`, canonical set | Page renamed during migration → lands on the section 404 (per-zone), with search |
| S-009 ocx CLI after cutover | `ocx` resolves a package through `https://index.ocx.sh/p/<ns>/<pkg>.json` | 200 JSON, unchanged | Someone widens the index.ocx.sh redirect → C-043 red in `cutover:verify` |
