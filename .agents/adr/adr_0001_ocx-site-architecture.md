# ADR 0001: ocx.sh site architecture — hosting, theme package, deploy, lore, gate

- Status: Proposed
- Date: 2026-09-27
- Deciders: owner (Michael Herwig); architect (agent)
- Compliance target: `HANDOVER.md` › Decisions (settled). This ADR amends it only
  where a factual premise was measured wrong; each amendment is listed in
  [HANDOVER amendments](#handover-amendments).
- System design and contracts: [`design_ocx-site.md`](design_ocx-site.md)

## Context

One site at `ocx.sh`, many repos, each deploying its own path to Bunny, one look,
header and search (HANDOVER). Binding gate answers: plan scope = this repo + lore
content in `docs/`; consumer migrations are follow-up plans that need a complete
adoption contract. `lore.ocx.sh` stays a subdomain. `.tmp/design/` is the only
design source. Owner re-scope (2026-09-27): build a solid system in this repo
first; no consumer docs move in the build-out plan.

What we measured on 2026-09-27 that changes premises:

| # | Fact | Evidence | Premise it corrects |
|---|---|---|---|
| F1 | Edge rules: 50 per pull zone, 5 triggers per rule, 5 patterns per trigger | bunny.net/docs/cdn/limits (research-domain-bunny) | HANDOVER "20 edge rules" |
| F2 | A storage-backed pull zone serves `/x/` **and** `/x` as `/x/index.html` with 200, and no redirect | `curl -I https://michael-herwig.de/cv` and `/cv/` both 200, `CDN-Cache: MISS`, and that zone has no index rule | research "Bunny does not map directory index", and the "directory index" rule in HANDOVER's budget |
| F3 | Starlight emits `@layer starlight.base, starlight.reset, starlight.core, starlight.content, starlight.components, starlight.utils`. Expressive Code CSS sits inside `starlight.components` | `examples/starlight/dist/_astro/*.css` | research "one `@layer starlight`, so ship the theme unlayered" |
| F4 | `ocx.sh` resolves to Cloudflare (proxied, NS `*.ns.cloudflare.com`). hetzner1 nginx behind it sends to JFrog via an **unanchored** `location ~ /v2/`: any URI containing `/v2/` matches. The token realm `https://ocx.sh/artifactory/api/docker/sh-ocx-oci-prod/v2/token` reaches JFrog only through that loose match. **Live bug today:** `/docs/v2/` returns JFrog's 401 | `dig`; `curl -I https://ocx.sh/v2/` and `curl -I https://ocx.sh/docs/v2/` both return 401 with `www-authenticate` | research assumed the apex DNS points straight at hetzner1, and knew only `/v2` |
| F5 | `index.ocx.sh` serves the sparse package index (`/config.json`, `/p/<ns>/<pkg>.json`) that the ocx CLI dials by default | `ocx/crates/ocx_cli/src/app/context.rs:1855` (`https://index.ocx.sh`); `curl` returns 200 `application/json` | HANDOVER "old subdomains redirect (301)" |
| F6 | `ocx.sh/schemas/<kind>/v<N>.json` is served by today's ocx site (`ocx.toml` `#:schema` points at it) | `ocx/website/src/public/schemas/`; `curl` returns 200 | not in any inventory |
| F7 | The only purge API is `BUNNY_API_KEY`, which is account-wide (rules, zones, DNS). www-setup deliberately keeps it out of CI | `www-setup/deploy/bunny/README.md` › Credentials | HANDOVER "purge that section's cache" in the CI action |
| F8 | HANDOVER's order "assets → HTML → **delete stale → purge**" leaves a window: an edge still holds old HTML while its old assets are already deleted | follows from F7 and the edge TTL | HANDOVER "never broken" claim for that order |
| F9 | On one origin, a root-relative link (`/catalog/`) is a correct *cross-section* link. `starlight-base-path` rewrites it to `/docs/catalog/` | how the plugin works + path-mounted topology | HANDOVER "plugin fixes base-path links" |

## Decision summary

| ID | Decision | Recommendation |
|---|---|---|
| D1.1 | Path registry | `nav.json` v4 `claims[]` is the one registry. The grammar is in the design doc. It is checked by `ocx-site check` and again by the deploy action |
| D1.2 | Storage topology | One storage zone per deploying repo (`sh-ocx-web-<repo>`) behind one pull zone, routed by `OriginStorage` edge rules. **Gated on milestone M0 (probe P1).** Fallback: per-repo pull zones + Change Origin URL |
| D1.3 | Freshness / purge | No purge in CI. HTML edge TTL is 60 s and browser caching is off. Hashed assets are immutable. A deploy prunes stale HTML only; stale non-HTML is removed by the owner-local `task bunny:gc` |
| D1.4 | Apex + registry | Staged (owner): (1) the `dev.ocx.sh` vhost on hetzner1 → Bunny as staging; (2) once the sites are released on Bunny, the `ocx.sh` vhost swaps `location /` from `ocx-website.pages.dev` to Bunny, with the registry locations anchored (`^~ /v2/`, `^~ /artifactory/api/docker/sh-ocx-oci-prod/`), plus one Cloudflare rule (browser cache TTL respects origin); (3) `ocx.sh` DNS → Bunny after the OCI registry is removed (earlier only via option 2). Rollback = revert that step |
| D1.5 | Preview hostname | `dev.ocx.sh` (existing hetzner1 vhost → `ocx-sh.b-cdn.net`, `X-Robots-Tag: noindex`) is the staging hostname. No `preview.ocx.sh`. No per-PR previews |
| D1.6 | Redirects | `index.ocx.sh`: HTML paths only → `ocx.sh/catalog/` (JSON paths keep serving). GitHub Pages: a meta-refresh + canonical stub per repo (Pages cannot 301). No Bunny redirect rules at launch |
| D2.1 | Package shape | Ship JS (`.mjs` + JSDoc) with `.d.mts` generated at `prepack`; `.astro` and `.css` ship as source. One plain-ESM bin `ocx-site` |
| D2.2 | Cascade | Everything the theme authors lives in one layer, `ocx`. `tokens.css` opens with `@layer starlight, ocx;`. The consumer's unlayered CSS wins over both |
| D2.3 | nav.json | v4: `sections`, `hubs`, `claims`, `entries`, `actions`, `footer`, plus an in-repo, shape-only `nav.schema.json` (2020-12, not exported). Drop `menuRules`, `menuItemFields`, `activeAlias`, `subsites`, `generator` |
| D2.4 | Plugin | Zero options. Validates `base` ∈ claims, sets `site` + `trailingSlash`, injects CSS and overrides, and derives `pagefind.mergeIndex` from claims. A link check replaces the base-path rewrite |
| D2.5 | VitePress | `./vitepress` = CSS only (code blocks + dark hook). The catalog renders the header from `nav.json` with the `./nav` helpers and the `base.css` classes |
| D3 | Deploy | A `node24` JS action at `.github/actions/deploy/` in this repo. TS on Node 24 stdlib, zero runtime dependencies. Released on the same `vX.Y.Z` train as the theme, with a floating `v1` and SHA-pinned consumers |
| D4 | Lore | Rule `ocx-design` (per edit) + skill `ocx-site-integration` (once per repo). No bundle, no review skill. Authored in `docs/lore/` and published **from this repo** into `ghcr.io/ocx-sh/lore/*`, announced into the grimoire-lore index (probe P4) |
| D5 | Gate | oxlint (type-aware) + typed ESLint + eslint-plugin-astro. oxfmt for everything except `.astro`, where Prettier + prettier-plugin-astro is scoped to that glob. Built-CSS scripts. Playwright e2e incl. a real-Chrome cascade probe and axe with the menu open. lhci asserts 1.0 × 4 on the median of 3 runs. Pack-smoke with a `strictest` fixture consumer. All of it sits in `task check`, and each CI job runs one of its subtasks. Visual snapshots deferred until the design draft stabilises |

---

## D1 Hosting and naming on Bunny

### D1.1 Path registry: where claims live

| Option | Description |
|---|---|
| A | `nav.json` `claims[]` in `@ocx-sh/theme`: one file drives the header, search merge, edge rules, the deploy guard and the checker |
| B | A per-repo `ocx-site.json` claim file in each consumer, collected at deploy time |
| C | Claims exist only in Bunny config (edge rules) |

| Criterion (weight) | A | B | C |
|---|---|---|---|
| Single source of truth (0.35) | 5 | 2 | 2 |
| Reviewable by owner (0.25) | 5 (CODEOWNERS on one file) | 2 | 1 |
| Machine-checkable offline (0.25) | 5 | 3 | 1 |
| Simplicity (0.15) | 5 | 3 | 4 |
| **Weighted** | **5.00** | 2.45 | 1.85 |

**Recommend A.** HANDOVER already settles "nav.json is the path registry". This
adds a `claims` array so the registry states ownership (`repo`) and searchability,
not only menu entries.

### D1.2 Storage-zone topology

| Option | Description |
|---|---|
| A | One shared storage zone. The deploy action refuses writes outside its `path` |
| B | One storage zone per deploying repo behind one pull zone. The `OriginStorage` edge-rule action (enum 17, not in the main docs table) binds a path prefix to a zone |
| C | One storage zone + one pull zone per repo. The apex pull zone uses the documented **Change Origin URL** action per prefix |
| D | One shared zone written only by a central deployer in this repo, which pulls consumer artifacts cross-repo |

| Criterion (weight) | A | B | C | D |
|---|---|---|---|---|
| Blast radius of one compromised consumer CI (0.30) | 1 (the key overwrites `/install/` → `curl \| sh` supply chain) | 5 | 5 | 4 |
| Simplicity / ops (0.25) | 5 | 4 | 2 | 1 |
| Documented / GA (0.15) | 5 | 2 | 5 | 5 |
| Per-section 404 + SPA fallback (0.10) | 1 (zone-global) | 5 (per zone) | 5 | 1 |
| Reversibility (0.10) | 5 | 4 | 4 | 3 |
| Cost (0.10) | 5 | 5 | 4 (double edge hop) | 5 |
| **Weighted** | 3.40 | **4.20** | 4.05 | 3.10 |

**Recommend B, gated on milestone M0 (probe P1, owner-run).** P1 checks: prefix → zone
routing with the path kept, directory index (F2) under the rule, the zone's own
`bunnycdn_errors/404.html`, the parameter format, whether a storage write auto-purges
the pull-zone cache under `OriginStorage` (D1.3 option v), and whether S3-enabled
storage zones work as `OriginStorage` targets (probe zones are created S3-enabled,
since S3 can only be set at creation). **If P1 fails, use C.** The deploy contract is
the same under C: only the edge rules change.

Why not A: its path guard runs inside the action the consumer calls with a key
the consumer holds. The guard stops accidents, not attackers. Under A a shared
key would also let the root repo's prune delete `/integrations/<x>/`.

Reversibility: every zone stores files under the **full public path**, so
`sh-ocx-web-ocx` holds `docs/…`. Moving between A, B and C is therefore a copy
plus a rule change. **Two-way door.**

### D1.3 Freshness, purge and the "never broken" guarantee

| Option | Description |
|---|---|
| i | Purge in CI (HANDOVER). Needs the account-wide `BUNNY_API_KEY` in every consumer |
| ii | No purge. HTML/non-hashed edge TTL 60 s, browser `no-cache`, `_astro/*` immutable 1 y. A deploy prunes stale `*.html` only and never deletes non-HTML. Owner-local `task bunny:gc -- --older-than 7d` removes stale non-HTML |
| iii | A purge broker (Edge Script / Worker holding the key; per-repo tokens) |
| iv | Purge only locally by the owner |
| v | ii + rely on Bunny auto-purge on storage write. **Conditional on P1** confirming it under `OriginStorage` routing |

| Criterion (weight) | i | ii | iii | iv | v |
|---|---|---|---|---|---|
| Guarantee holds by construction (0.35) | 3 (F8 window) | 4 (geo-replication lag residual) | 5 | 3 | 4 |
| Secret exposure (0.30) | 1 | 5 | 4 | 5 | 5 |
| Freshness (0.15) | 5 | 4 (≈ 2 × TTL) | 5 | 1 | 5 |
| Simplicity (0.20) | 4 | 4 | 1 | 3 | 4 |
| **Weighted** | 2.90 | **4.30** | 3.90 | 3.30 | 4.45 (if P1) |

**Recommend ii; it becomes v at zero code cost if P1 confirms auto-purge** (the TTL
stays as backstop). Assets are never deleted by a deploy, so no cached HTML can
reference a missing asset. HTML staleness is ≈ 2 × TTL (~120 s): origin shield plus
stale-while-updating each add up to one TTL. `LastChanged` means "last deploy that
contained this file" (every deploy re-PUTs all files), not "stale since", so the gc
treats a file as stale only when it is older than the claim's live `index.html` and
runs only far beyond any TTL (design C-072). A local `task bunny:purge` stays
available for emergencies.

### D1.4 Apex cutover and `/v2` + `/artifactory` coexistence

| Option | Description |
|---|---|
| 1 | Keep Cloudflare → hetzner1 nginx. Anchor the registry locations, change `location /` upstream to `https://ocx-sh.b-cdn.net` (Bunny). Registry proxy bodies stay byte-identical |
| 2 | Move apex DNS to Bunny. Edge rules Change Origin URL + Set Host send `/v2/*` and `/artifactory/*` to JFrog (research's recommendation) |
| 3 | Cloudflare Origin Rules split by path: registry → hetzner1, everything else → Bunny |
| 4 | Move the registry to a subdomain |
| 5 | Bunny Edge Scripting middleware for the registry (Preview status) |

| Criterion (weight) | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Registry risk: pulls, pushes, auth, large blobs (0.35) | 5 | 2 | 5 | 1 (breaks every `ocx.sh/<ns>/<pkg>` ref) | 2 |
| Simplicity (0.20) | 5 | 3 | 3 | 2 | 2 |
| Rollback (0.20) | 5 (one line) | 3 (DNS TTL) | 4 | 1 | 3 |
| HTML performance / availability (0.15) | 2 (hetzner in path) | 5 | 4 | 5 | 5 |
| Bandwidth-cap coupling (0.10) | 5 | 1 (blob traffic counts against the site's cap, and tripping the cap kills pulls) | 5 | 5 | 1 |
| **Weighted** | **4.55** | 2.75 | 4.25 | 2.20 | 2.55 |

**Decided by the owner (was Q3): option 1 as the interim, DNS to Bunny as the end
state.** Sequence (design §2.8): (a) the owner points the existing `dev.ocx.sh`
vhost at Bunny as staging (D1.5); (b) once the sites are released on Bunny, the same
`location /` swap on the `ocx.sh` vhost; (c) `ocx.sh` DNS moves to Bunny and hetzner1
leaves the HTML path. (c) waits for the OCI registry's planned removal: with no
registry, option 2 loses both its low scores (registry risk, bandwidth coupling),
and no registry or token-realm traffic ever crosses Bunny edge rules. If DNS must
move while the registry lives, the fallback is option 2 (two edge rules, Change
Origin URL + Set Host → JFrog).

The `ocx.sh` nginx edit (design §2.8 step 5) does three things: `location ^~ /v2/`
and `location ^~ /artifactory/api/docker/sh-ocx-oci-prod/` → JFrog (fixes F4's live
`/docs/v2/` bug; the `~ /v2/` regex is deleted), and `location /` → Bunny through
`resolver` + a variable upstream so nginx re-resolves Bunny's rotating IPs. nginx
talks to Bunny as `ocx-sh.b-cdn.net` (SNI + Host), so Bunny needs no certificate for
`ocx.sh` before (c). Registry pulls never touch Bunny. Cloudflare proxies `ocx.sh`
and `dev.ocx.sh`, so a Cloudflare rule sets **Browser Cache TTL: respect existing
headers** for both hosts; otherwise it could rewrite Bunny's `no-cache`. Rollback:
restore the `pages.dev` upstream (b) or the proxied hetzner1 record (c, DNS TTL), and
keep the CF Pages project alive for 30 days after (b). The anchor fix alone can ship
now.

### D1.5 Preview hostname

| Option | Verdict |
|---|---|
| a. `dev.ocx.sh` = the existing hetzner1 vhost, proxying to `ocx-sh.b-cdn.net` (SNI + Host) with `X-Robots-Tag: noindex` | **Decided (owner).** No new DNS record or Bunny certificate. Phase 2 "every section up on a preview hostname" is satisfied by production content before the `ocx.sh` swap. Afterwards it stays a bypass for debugging |
| a′. `preview.ocx.sh` = second hostname of the production pull zone | Dropped (owner): a new record + certificate for what `dev.ocx.sh` already gives |
| b. Per-PR wildcard `pr-<n>-<repo>.dev.ocx.sh` | Add when a reviewer who is not the owner needs PR previews: wildcard certificate, cleanup job |
| c. Per-PR path prefix | Reject. The build base differs from production, so cross-section links break |

### D1.6 Redirect inventory

Criteria: old URLs keep working (0.4), no shipped client breaks (0.4), Bunny rule
cost (0.2). Options: (a) Bunny redirect rules for every old host. Not possible for
`github.io`, and it would take hosts off Cloudflare. (b) **Redirect each host where
it is served today: nginx, Cloudflare rule, Pages stub.** (c) No redirects, old
hosts left to rot. **Recommend b.** Full table in the design doc. `dev.ocx.sh` is not redirected: it is
the staging host (D1.5). `index.ocx.sh` → a Cloudflare redirect rule that matches HTML paths only and
**excludes `*.json` and `/p/*`**. **One-way-door hazard: a blanket redirect breaks
every shipped ocx CLI** (F5). GitHub Pages URLs: each repo replaces its Pages
content with `index.html` + `404.html` redirect stubs (meta refresh + canonical +
`location.replace` that keeps the path). Pages cannot send a 301 (H15). Old `ocx.sh/docs/<page>` URLs survive
untouched (F2 serves `/docs/x` without a slash). Bunny edge rules used for
redirects at launch: 0.

### D1 secrets model

| Secret | Scope | Where | Who sets it |
|---|---|---|---|
| `BUNNY_STORAGE_KEY` | password of **that repo's** zone only | the consumer repo's GitHub environment `ocx.sh`, deployment branches = `main` | owner, via `task bunny:onboard` (pipes it into `gh secret set`) |
| `BUNNY_API_KEY` | account-wide | owner's gitignored `.env` only; **never CI** | owner |
| `LORE_ANNOUNCE_TOKEN` | GitHub App or fine-grained PAT: PR write on `ocx-sh/grimoire-lore` only | this repo's environment `lore`, deployment branches = `main` | owner |

Options: (a) one org-level storage key shared by all repos (HANDOVER), (b) **one
key per repo zone in that repo's environment**, (c) OIDC federation. Research found
no Bunny OIDC, so (c) is unavailable. **Recommend b** (follows D1.2): blast radius
is one section. It costs one `gh secret set` per repo, and `task bunny:onboard`
scripts that.

---

## D2 `@ocx-sh/theme` package surface

### D2.1 Ship source vs build

| Option | Consumer compatibility (0.30) | Simplicity + dev loop (0.30) | Type contract (0.20) | Packaging-rule conformance (0.20) | **Weighted** |
|---|---|---|---|---|---|
| a. Source (`.ts`/`.astro`/`.css`) + plain-ESM bin | 3 (raw `.ts` under `node_modules` breaks strict consumers' `tsc`; Starlight itself left this, withastro/starlight#3572) | 5 | 3 | 2 | 3.40 |
| b. **JS (`.mjs` + JSDoc) + `.d.mts` generated at `prepack`; `.astro`/`.css` as source** | 5 (no transform needed, types resolve) | 5 (no build step in dev) | 5 | 5 | **5.00** |
| c. `tsc` → `.js` + `.d.ts` from `.ts`, `.astro` as source | 4 | 3 (`.astro` imports compiled paths, so dev needs a build first) | 5 | 5 | 4.10 |
| d. Bundle (tsup/vite lib) | 3 | 2 | 5 | 4 | 3.30 |

**Recommend b.** Author `src/starlight/index.mjs`, `src/nav.mjs`, `src/registry.mjs`
with JSDoc, checked by `tsc --checkJs`. `prepack` runs `tsc --allowJs --declaration
--emitDeclarationOnly` to emit `.d.mts` next to each `.mjs` (gitignored, never
committed). TS-PKG floor met in full; `publint` and `attw` run on the JS exports. The
decisive test stays the fixture consumer on `astro/tsconfigs/strictest` (`astro check`
+ `astro build` against the installed tarball).

Fonts: Astro Fonts API vs fontsource CSS (preload + metric fallback) is decided by
probe P5. `./fonts.css` stays exported either way, because the VitePress catalog
needs plain CSS.

### D2.2 Cascade-layer strategy

| Option | Consumer's plain rule wins (0.40) | Beats Starlight (0.30) | Simplicity (0.20) | css-theming CSS-CAS-02 (0.10) | **Weighted** |
|---|---|---|---|---|---|
| a. Unlayered theme (research) | 2 (only by specificity or order) | 5 | 5 | 1 | 3.40 |
| b. One layer `ocx`, order statement `@layer starlight, ocx;` | 5 | 5 | 5 | 5 | **5.00** |
| c. Sub-layers `ocx.tokens, ocx.base, ocx.starlight` | 5 | 5 | 3 | 4 | 4.50 |
| d. Inside Starlight's namespace (`starlight.ocx`) | 5 | 3 | 3 | 2 | 3.70 |

**Recommend b.** Order: `starlight.*` (all six sub-layers, EC included) < `ocx` <
unlayered consumer CSS. VitePress 2 (`@layer __vitepress_base`) resolves the same
way, and the catalog already uses `@layer ocx`. Rules: every theme `.css` file and
every `<style>` in a theme `.astro` component is wrapped in `@layer ocx { }`. No
`!important`. `@font-face` stays outside the layer, since it cannot be layered.

### D2.3 `nav.json` shape

| Option | Verdict |
|---|---|
| a. Keep v3, add `claims` | Rejected. `subsites` plus prose `menuItems` duplicate the entry data, and `menuRules` is prose inside data |
| b. **v4**: `claims` (registry), `hubs` (categories), `entries` (menu/hub cards), `sections`, `actions`, `footer`, plus an in-repo `nav.schema.json` | **Recommend.** The schema is shape-only (editors, tests) and not exported. Cross-reference and uniqueness rules live only in `validate()` |
| c. Split `registry.json` / `nav.json` | Rejected. Two files that must agree, two release concerns, one consumer |

`menuRules` and `menuItemFields` move into the `ocx-design` rule and the schema's
`description`s. `activeAlias` is derivable (hub → the section that lists it).

### D2.4 Plugin behaviour and overrides

The plugin takes zero options (a speculative knob would be dead flexibility). It
reads `astroConfig.base`, finds the claim, and fails the build if there is none. It
sets `site: https://ocx.sh` and `trailingSlash: 'always'` through an injected
integration. The consumer's own `customCss`, `components` and
`expressiveCode` entries win. The full override list is in the design doc.

Base-path links (F9). Criteria: cross-section links stay correct (0.5), catches
authoring mistakes (0.3), code owned (0.2).

| Option | Verdict |
|---|---|
| a. Bundle `starlight-base-path` (HANDOVER, research) | Rejected. It rewrites `/catalog/` → `/docs/catalog/` |
| b. Own remark plugin that rewrites only links outside every claim | Rejected. It silently guesses author intent |
| c. **Link check** in `ocx-site check`: every root-relative URL in `dist/**/*.html` falls under a claim, and one under the repo's own claim exists in `dist` | **Recommend.** Authors write full paths (`/docs/x/`), and the build tells them when they don't |

Boundary note: HANDOVER says "no header JS". The mega-menu opens with the Popover
API, sits `position: fixed` below the header (CSS anchor positioning only as
progressive enhancement: Baseline Jan 2026, Starlight's floor is Safari 17 / Firefox
125), and switches tabs with CSS `:has()`. Two tiny scripts remain, neither causes
layout shift: the theme toggle, and a ~5-line `focusout` handler that closes the
popover when focus leaves it (WCAG 2.4.11). The route middleware
(`addRouteMiddleware`) computes the eyebrow group label and, only if CSS cannot
flatten the sidebar, flattens `starlightRoute.sidebar`. No `Sidebar` override.

### D2.5 VitePress adapter scope

| Option | Verdict |
|---|---|
| a. `./vitepress` = `vitepress.css` (code blocks, `.dark` hook). Header markup rendered by the catalog's `Layout.vue` from `nav.json` + `./nav` helpers + `base.css` classes | **Recommend.** The catalog is a custom VitePress theme (no DefaultTheme), already `--ocx-*` and `@layer ocx` |
| b. A Vue header component inside the package | Rejected. A `vue` peer dependency and a second header implementation, for a phase-5 throwaway |
| c. Drop the export | Rejected. HANDOVER lists it, and the catalog needs one import to track |

---

## D3 Reusable deploy

| Option | Fits consumer secret/env model (0.20) | Its own code at the pinned ref (0.25) | Testability (0.25) | Simplicity (0.20) | Supply chain (0.10) | **Weighted** |
|---|---|---|---|---|---|---|
| a. Composite action + `node deploy.ts` | 4 | 5 (`github.action_path`) | 4 | 4 (needs setup-node: the runner's default Node is too old for type stripping) | 4 | 4.25 |
| b. Reusable workflow (`workflow_call`) | 5 (holds `environment`) | 2 (needs a self-checkout plus resolving its own SHA, which is fragile) | 3 | 3 | 4 | 3.25 |
| c. **`node24` JS action**, `index.mjs` shim → `deploy.ts` | 4 | 5 | 5 | 5 | 5 | **4.80** |
| d. `ayeressian/*` / `R-J-dev/*` | 4 | 5 | 1 | 5 | 1 | 3.40 |

**Recommend c** (probe P3: the node24 runner strips types in a `.ts` file outside
`node_modules`. Fallback: commit `tsc` output as `dist/deploy.mjs` with a freshness
check). The consumer job owns `environment: ocx.sh`, `concurrency` and
`permissions: {}`. Its workflow triggers on `push: main`, a daily `schedule:` and
`workflow_dispatch`: a Dependabot PR auto-merged with `GITHUB_TOKEN` fires no `push`
run, so the schedule is what redeploys after a theme bump. The skill ships that job
as a template. The input is `path`, not HANDOVER's `section` (H16).

| Location / versioning | Verdict |
|---|---|
| **This repo, `.github/actions/deploy/`, one release train `vX.Y.Z` for theme + action, first release `1.0.0` (0.x minors count as breaking), floating `v1` moved after tests, consumers pin SHA + `# vX.Y.Z`** | **Recommend.** The action reads `nav.json` from its own checkout, so a new claim ships in the same release that the consumer picks up. Dependabot `github-actions` + `npm` both follow one tag stream |
| Separate `ocx-sh/deploy-action` repo | Rejected. The registry would then live in two repos or be fetched |
| Separate tag namespaces (`theme-v*`, `deploy-v*`) | Rejected. Dependabot handles prefixed tags poorly, and there are two changelogs for one registry |

npm bootstrap: `@ocx-sh/theme` does not exist yet, OIDC cannot publish a first version
(npm/cli#8544), and trusted publishers created after 2026-09-03 default to
stage-publish only. So the owner publishes `1.0.0` from the green `v1.0.0` tag with a
short-lived token, then configures the trusted publisher for `release.yml` with direct
publish enabled. `release.yml` runs `npm publish --provenance` and skips publishing
when that exact version is already on npm.

| Language | Verdict |
|---|---|
| **TS on Node 24 stdlib (`fetch`, `crypto`, `fs`)** | **Recommend.** Listing, pruning and parallel PUTs are tested with Vitest against a `node:http` fake Bunny |
| bash on `bunny.sh` | Rejected. Recursive list + JSON + prune + parallelism in bash/jq is untestable at this bar. The `Checksum`/`AccessKey`/retry semantics are ported from bunny.sh |
| Python via uv (the `edge-rules.py` lineage) | Rejected. It adds a runtime to every consumer job, and this repo has no Python toolchain in `ocx.toml`. The edge-rule generator is ported to TS too (`task bunny:*`) |

Criteria for the language choice: testability (0.4), zero consumer-side setup
(0.3), reuse of the repo toolchain (0.3).

Pagefind responsibility moves to the **consumer build**: Starlight already emits
`dist/pagefind/`. The action only verifies the bundle exists when the claim has
`search: true`.

---

## D4 Lore artifacts

| Option | Right trigger moment (0.35) | No duplication (0.25) | Minimal count (0.25) | Lore conventions (0.15) | **Weighted** |
|---|---|---|---|---|---|
| a. **Rule `ocx-design` + skill `ocx-site-integration`** | 5 | 5 | 4 | 5 | **4.75** |
| b. a + on-demand `ocx-site-review` skill | 5 | 4 | 2 | 5 | 4.00 |
| c. One skill for everything | 2 (design must load per edit) | 4 | 5 | 2 | 3.25 |
| d. a as a two-member bundle `ocx-site` | 5 | 5 | 3 | 3 | 4.20 |

**Recommend a.** The rule is the per-edit gate: DESIGN.md-shaped token table,
do/don't pairs, OCX-specific forbidden values, and the lint command. Generic CSS rows
(literal colours, `!important`, tokens-only, override twice, cascade mechanics) cite
`css-theming` IDs (CSS-TOK-01, CSS-CAS-03, CSS-TOK-03, CSS-CAS-02) and never restate
them. The skill is the once-per-repo
adoption procedure and installs the rule as one of its steps, so no bundle is
needed. Add a review skill when a second reviewer exists.

| Authoring / publishing | Verdict |
|---|---|
| i. **Author in `docs/lore/`, publish from this repo** (`docs/lore/publish.toml`, `repository_prefix = "ocx-sh/lore"`, `[announce]` → grimoire-lore) | **Recommend** (probe P4). The rule changes in the same PR as the theme it describes. grimoire-lore's publish.toml documents "N separate skill repos announce into" one index |
| ii. Author here, copy-PR into grimoire-lore | Fallback if P4 fails. Risks drift |
| iii. Author in grimoire-lore | Rejected. The theme and its rule would be versioned apart |

Versioning: per-entry `version` in `docs/lore/publish.toml`. Bump when the
artifact's content changes, independent of the npm train.

---

## D5 Quality gate

| Axis | Options (≥3) | Criteria (weight) | Recommendation |
|---|---|---|---|
| Lint | typed ESLint only · oxlint only · **oxlint `--type-aware` + typed ESLint + eslint-plugin-astro (eslint-plugin-oxlint turns off overlaps)** | owner ask (0.4), `.astro` template coverage (0.3), speed (0.3) | **Both**: oxlint does not lint `.astro` templates, so ESLint stays the authority |
| Format | Prettier all · **oxfmt everywhere except `.astro` + Prettier/prettier-plugin-astro scoped to `*.astro`** · oxfmt all (beta, Astro unresolved) · none | owner ask (0.4), correctness on `.astro` (0.4), tool count (0.2) | **Split by glob.** `ponytail:` marker: drop Prettier when oxfmt closes its Astro tracking issue |
| Built-CSS contract | none · source-parse tests (today) · **css-theming gate.md scripts on built `dist/**/*.css` + `*.html`, with a justified third-party allowlist** | CSS-GATE-01 (0.6), false-positive control (0.4) | **gate.md scripts**, each watched going red once (CSS-GATE-02) |
| Cascade proof | none · happy-dom/jsdom (forbidden) · **Playwright real Chrome, 4-control harness** | correctness (1.0) | **Playwright** |
| Lighthouse | treosh action · live-URL runs · **`lhci autorun`, `staticDistDir`, fixture pages, `runs: 3`, median, assert `minScore: 1` × 4** | determinism (0.5), prior art reuse (0.3), deps (0.2) | **lhci on built dist**. The lhci static server serves at `/`, so the `/docs/` build is copied under `<tmp>/docs/` first. @lhci/cli 0.15.1 bundles Lighthouse 12.6 (PageSpeed may differ). Copy `lhci-posix-tmpdir.cjs` for WSL. Lighthouse never audits an open popover, so e2e adds an axe scan with the menu open |
| Visual CI | Argos · Chromatic · Playwright `toHaveScreenshot` in the pinned image · **none yet** | no new vendor/secret (0.4), determinism (0.4), review UI (0.2) | **Deferred** until the design draft stabilises: baselines would churn with every mock change. `task visual` is the fidelity loop. Add Playwright snapshots in the pinned image first, Argos when a second reviewer needs a diff UI |
| Fidelity loop | none · **local `task visual`: mock element vs site page pairs + diff, `--watch`** · mock-diff as a CI gate | owner live review (0.6), stability of the baseline (0.4) | **local only**: mocks move, so they are not a CI baseline |
| Pack | publint only · **pack-smoke: pack, publint, `publish --dry-run` auto-correct guard, tier-3 fixture consumer, run bin** · attw | TS-PKG-01/02/03 (0.7), source-shipping fit (0.3) | **pack-smoke on every PR** |
| CI shape | CI runs `task check` in one job · **each CI job runs one subtask that `check` also runs** · hand-copied steps | parallelism (0.5), one source of truth (0.5) | **subtask per job** (AGENTS.md amendment). The `build` job uploads the dists; `e2e` and `lighthouse` download them, and every dist-consuming target fails loudly on a missing dist (C-071) |
| Workflow hygiene | — | zizmor clean | `dependabot.yml` sets `cooldown`; every checkout `persist-credentials: false`; no setup cache in `release.yml`; zizmor pinned in `ocx.toml` (not `uvx`) |

---

## Consequences

- One file (`nav.json`) drives the header, search merge, edge rules, the deploy
  guard and the checker. A path change is one PR plus one release.
- Consumers hold one secret each, with section-scoped blast radius. The owner
  keeps the only account-wide key.
- Sections are **not deployed in lockstep**, so for up to about a day two sections
  can show different navs (Dependabot latency). Nav changes are additive, and
  removing a claim takes two releases (hide, then delete).
- hetzner1 stays in the `ocx.sh` HTML path until the DNS move, which waits for
  the OCI registry's removal. `dev.ocx.sh` staging stays on hetzner1.
- Stale non-HTML accumulates in each zone until the owner runs `task bunny:gc`.
- A theme release is also an action release. A breaking change to either is v2
  for both.

## One-way doors

| # | Door | Why irreversible | Mitigation |
|---|---|---|---|
| OW1 | Published slugs (`/integrations/<slug>/`, top-level segments once live) | Links, search engines and package READMEs pin them | Slugs fixed in the design-doc table now. Any later rename is a permanent redirect rule. The grammar rules R3/R4 are policy (two-way): changing them breaks no published URL |
| OW2 | `index.ocx.sh` JSON paths | Default host baked into shipped ocx binaries (F5) | HTML-only redirect. Contract C-043 is a guard in the checker/runbook |
| OW3 | Apex `/v2/` + `/artifactory/api/docker/sh-ocx-oci-prod/` routing | Every `ocx.sh/<ns>/<pkg>` ref and the token realm | D1.4 option 1 keeps the proxy bodies; only the match is anchored. Smoke `docker pull` + `ocx install` gate the `ocx.sh` swap (S-007). The DNS move waits for registry removal (else option 2) |
| OW4 | REMOVED — registry clients only request `/v2/…`, so site segments and registry namespaces never collide | — | — |
| OW5 | npm name `@ocx-sh/theme` + export keys | Removing an export is a major version for ~8 repos | Only exports that have a consumer today (design doc §4.1) |
| OW6 | Lore names `ghcr.io/ocx-sh/lore/ocx-design`, `…/ocx-site-integration` | Public once in any `grimoire.lock` | Names fixed here |
| OW7 | Storage-zone names | Bunny names are global and cannot be renamed | Cheap to recreate. Two-way in practice |

## HANDOVER amendments

| # | HANDOVER text | Amend to | Basis |
|---|---|---|---|
| H1 | "20 edge rules per pull zone" | 50 per zone (5 triggers × 5 patterns) | F1 |
| H2 | Budget "directory index, per-section 404, SPA fallback" as edge rules | Directory index is native. The 404 is each zone's `bunnycdn_errors/404.html`. SPA fallback is a per-zone setting. None costs a rule | F2, D1.2 |
| H3 | "One Storage Zone + one Pull Zone"; "org-level Bunny secrets" | One storage zone per deploying repo behind one pull zone (probe P1). Per-repo environment secret | D1.2 |
| H4 | Action steps "run Pagefind → … → delete stale → purge" | Consumer build emits Pagefind. Action: validate → hashed/non-HTML → HTML + Pagefind fixed-name files → prune stale HTML only. Stale non-HTML via owner `task bunny:gc`. No purge in CI | F7, F8, D1.3 |
| H5 | "Apex cutover … cut DNS last" | Staged: `dev.ocx.sh` vhost → Bunny (noindex staging) first; then the `ocx.sh` vhost edit (anchor `^~ /v2/` + `^~ /artifactory/api/docker/sh-ocx-oci-prod/`, `location /` → Bunny) + Cloudflare "respect existing headers" rule; DNS → Bunny last, after the OCI registry is removed (earlier only via D1.4 option 2) | F4, D1.4 |
| H6 | "Old subdomains … redirect (301)" (includes index.ocx.sh) | `index.ocx.sh` stays as the index host. Only its HTML paths redirect to `/catalog/`. `dev.ocx.sh` becomes the staging host, not a redirect | F5, D1.5 |
| H7 | Plugin "fixes base-path links" | Plugin validates `base`. `ocx-site check` rejects root-relative links outside claims | F9 |
| H8 | "a cascade layer so a consumer's plain rule wins" (unspecified) | One layer `ocx`, `@layer starlight, ocx;` | F3, D2.2 |
| H9 | Dependabot snippet with `groups:` | No group (one package). Add a `github-actions` ecosystem entry for the action pin | D3 |
| H10 | `./vitepress` "thin adapter" | CSS only. Header from `nav.json` + `./nav` in the catalog's own layout | D2.5 |
| H11 | Lore "authored in `ocx-sh/grimoire-lore`" | Authored in `docs/lore/` here, published from here into the same prefix, announced into grimoire-lore | D4 |
| H12 | Path table lacks `/schemas/` | Claim `/schemas/` → `ocx-sh/ocx` | F6 |
| H13 | `nav.json` fields | v4 shape (D2.3) | D2.3 |
| H14 | AGENTS.md "CI calls only `task check`" | Each CI job calls one subtask of `check`. `check` is the local union | D5 |
| H15 | "GitHub Pages URLs redirect (301)" | Pages stubs: meta refresh + canonical + `location.replace` (Pages cannot 301) | D1.6 |
| H16 | Action input `section` | Input `path` (a claim path; default = the repo's claim) | D3, design §3.2 |

## Rollout

| Phase (HANDOVER) | Steps | Exit criterion |
|---|---|---|
| 1 Library | nav.json v4 + schema + registry.mjs + `ocx-site` bin. `@layer ocx`. Overrides (design doc §4.4). `./nav`, `./vitepress`. Gate D5. `task visual`. Probe P5 (Lighthouse on a fresh template, fonts choice) **first** | C-001…C-034, C-055…C-059, C-070, C-071 green. `task check` green. Owner signs off the visual pairs (plan gate G1) |
| 1b Lore | `docs/lore/` rule + skill + readmes + publish.toml. Probe P4 | C-060…C-066. `grim build` clean |
| 2 Hosting | **M0**: owner runs P1 on S3-enabled scratch zones, records the result and picks topology B or C. P3 runs inside the deploy WP. `task bunny:onboard` for this repo. Pull zone + zone settings + `task bunny:apply`. Owner points the `dev.ocx.sh` vhost at Bunny (staging, noindex). Owner bootstraps npm `1.0.0`, release `v1.0.0`. `site/` deployed via `./.github/actions/deploy` | C-035…C-054, C-067…C-069, C-072. The root site renders on `dev.ocx.sh` with `X-Robots-Tag: noindex` |
| 3 Consumers | Per-repo follow-up plans using the skill (docs, rules_ocx, SDK, catalog tokens, lore `customCss`), started only on owner decision. `task bunny:onboard` per repo | The consumer's `ocx-site check` + deploy are green; it renders on `dev.ocx.sh` |
| 4 Cutover | Once the sites are released on Bunny: old-URL inventory check on `dev.ocx.sh` → `ocx.sh` vhost edit (anchor registry + upstream swap) + Cloudflare browser-TTL rule → registry smoke → `index.ocx.sh` HTML-only rule → Pages stubs → retire CF Pages after 30 days | S-007 passes. `task cutover:verify` (C-054) green. lychee clean |
| 4b DNS | After the OCI registry is removed: `ocx.sh` hostname + certificate on the pull zone, Cloudflare `ocx.sh` record → DNS-only CNAME `ocx-sh.b-cdn.net`. Registry still live → D1.4 option 2 edge rules first | `task cutover:verify -- --host ocx.sh` green; hetzner1 serves no `ocx.sh` traffic |
| 5 | Catalog Astro port (unchanged) | — |

## Probes (block only the parts they gate)

| ID | Question | Gates | Fallback |
|---|---|---|---|
| P1 (M0, owner) | Does `OriginStorage` route prefix → zone with the path kept, serve dir index and the zone's own 404? Does a storage write auto-purge the pull-zone cache under `OriginStorage`? Do S3-enabled storage zones work as `OriginStorage` targets? | D1.2 B; D1.3 v; S3 flag at zone creation | Option C; D1.3 ii; zones without S3 |
| P2 | REMOVED — the grace prune is gone; `bunny:gc` (C-072) needs no probe | — | — |
| P3 | Does the node24 action runner execute a `.ts` import outside `node_modules`? | D3 c | Committed `tsc` output + freshness check |
| P4 | Can `grim publish` run from `docs/lore/` and announce into grimoire-lore? | D4 i | Copy PR |
| P5 | Does a fresh Starlight + Pagefind + theme page score 100 × 4 (mobile, median of 3)? Astro Fonts API or fontsource CSS (preload + metric fallback)? | D5 assertion level; D2.1 fonts | Fix the offender. Never lower the assertion without owner sign-off |
| P6 | Does Pagefind `mergeIndex` with one 404ing bundle still return own-section hits? What happens with a bundle built by an older Pagefind? | C-021, C-070 | Plugin merges only claims with `search: true`, a flag set once a section is live |

M0 pass criteria (recorded in the plan's M0 section): all three P1 routing checks
(path kept, dir index, the zone's own 404) pass → topology B; any routing check fails → topology C.
The auto-purge and S3 answers only select D1.3 v and the S3 flag. Live Bunny tasks
and the deploy action's production release wait for M0; offline code and tests do not.

## Open questions (≤3)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Auto-merge `@ocx-sh/theme` Dependabot PRs on green? | **Yes, patch + minor**, via `dependabot/fetch-metadata` + `gh pr merge --auto --squash` in the skill's template. Majors stay manual |
| Q2 | Versioned docs (`<claim>v<N>/`) within a year? | **No.** Version namespaces are dropped; `v<N>` stays reserved (R8), so adding them later breaks nothing |

Q3 (take hetzner1 out of the HTML path) is closed: the owner decided the staged
sequence ending in a DNS move after registry removal (D1.4).

## Amendment (2026-09-28): Zag supplies component behaviour

Zag (`@zag-js/*`, exact-pinned at `1.44.0`, no `^`/`~`/range) supplies the
state machine and behaviour for every interactive theme component; our public
API, markup and token CSS stay ours (`ssrAttrs`/`ssrApi`/`mount` glue in
`packages/theme/src/components/ui/zag.mjs`). This does not revise D2.1–D2.5:
the package still ships `.mjs` + JSDoc with `.d.mts` at `prepack`, one `ocx`
CSS layer, and the same `nav.json`-driven plugin. See
[plan_zag-adoption.md](../plans/plan_zag-adoption.md) › Decisions (D-Z table)
for the closed questions and the component-by-component adoption record.
