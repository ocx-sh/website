# ADR 0002: Phase 2 — root site, Bunny as code, deploy action, `ocx.sh` cutover

- Status: Accepted 2026-09-30 (owner sequence), **amended the same day by
  [Amendment 1](#amendment-1-2026-09-30-dns-stays-on-cloudflare-nginx-interim)**: DNS stays on
  Cloudflare, hetzner1 nginx fronts Bunny, the apex flip waits for end of 2026. Where the amendment
  and older text disagree, the amendment wins. [Amendment 2](#amendment-2-2026-10-04-owner-delegation-and-rehearsal-topology)
  (2026-10-04) records the owner's delegation and the rehearsal topology and wins over Amendment 1
  where they differ. Two questions stay open with a default each
  ([Open questions](#open-questions)); the defaults apply unless the owner overrides them.
- Date: 2026-09-30
- Deciders: owner (Michael Herwig); architect (agent)
- Amends: [ADR 0001](adr_0001_ocx-site-architecture.md), each change listed in
  [ADR 0001 amendments](#adr-0001-amendments). Supersedes `design_ocx-site.md` §2.1, §2.2 (S3 line),
  §2.4, §2.6 (Bunny rows), §2.8 and §3.1, and the Stage B contracts the plan marks superseded.
- Plan: [plan_website-buildout.md](../plans/plan_website-buildout.md) › Stage B. The plan holds the
  canonical Stage B contract text (C-303 onward, amended older IDs) and scenarios (S-114 onward).
- Research: `.agents/research/phase2_{bunny,deploy,cutover}.md` (2026-09-30).

## Context

Phase 1 is merged on `main`: `@ocx-sh/theme`, the showcase, `ci.yml`, the tag release
`release.yml`, the grim skills `skills/ocx-theme-*`, and consumer preview builds
(`task previews`, `previews.yml` with a gated Bunny placeholder). Nothing is hosted on Bunny yet.

Owner decisions, 2026-09-30 (binding for this ADR):

1. Sequence: npm release `v0.1.0` by hand → port the root site (`/`, `/integrations/`, `/apps/`,
   `/install/`) → Bunny dev on Bunny's own `*.b-cdn.net` hostname (no DNS change) → Bunny prod
   zone → `ocx.sh` DNS to Bunny → consumer migration (phase 3).
2. During and after the cutover, Bunny edge rules serve not-yet-migrated sections from their
   current hosts until each section migrates.
3. Bunny zone changes run as a local task on the owner's machine with the account key.
   `BUNNY_API_KEY` never reaches CI; CI holds per-zone storage keys only. No secret is committed.
4. The same Bunny setup hosts the consumer previews: `*.b-cdn.net` hostnames first,
   `*.preview.ocx.sh` later.
5. Lore: `skills/ocx-theme-*` exist; fold HANDOVER's `ocx-site-integration` skill and `ocx-design`
   rule in only if cheap.

What we measured on 2026-09-30 that ADR 0001 did not know:

| # | Fact | Evidence | Consequence |
|---|---|---|---|
| F10 | hetzner1 nginx (`nginx-main`, `ocx-sh-00.conf`) serves exactly three things for `ocx.sh`: `location /` → `https://ocx-website.pages.dev` (Host rewritten), `~ ^/v2/(?:sh-ocx-oci-prod/)?(.*)` and `~ ^/artifactory/api/docker/sh-ocx-oci-prod/v2/(.*)` → JFrog. It adds CSP, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection` | read-only `ssh hetzner`, config files only; local mirror `server-hetzner1/nginx` | Closes HANDOVER's open question "what else hetzner1 serves". See [inventory outcome](#hetzner1--cloudflare-inventory-outcome) |
| F11 | A live docs page loads root-absolute URLs outside `/docs/`: `/assets/*`, `/icons/*`, `/logo.svg`, `/site.webmanifest`, `/apple-touch-icon.png`, `/vp-icons.css`, `/team`; `/hashmap.json` and `/casts/*.cast` are 200 too | `curl https://ocx.sh/docs/getting-started` | A proxy of `/docs/*` alone breaks every docs page. The legacy rule needs these paths too |
| F12 | `/catalog`, `/catalog/*` → 302 `https://index.ocx.sh/:splat` (Pages `_redirects`, not nginx). `index.ocx.sh` HTML uses root-absolute `/assets/…` | `curl -I https://ocx.sh/catalog/foo`; `ocx/website/src/public/_redirects` | Proxying `/catalog/*` would load `ocx.sh/assets/…`, the docs site's assets. Keep the 302 |
| F13 | GitHub Pages sections live at `ocx-sh.github.io/{rules_ocx,ocx-sdk-python,catalog}/` (200). `ocx-sh.github.io/` is 404 (no org site, so no custom-domain redirect loop). None is reachable under `ocx.sh` today | `curl -I` | Their claim paths differ from their Pages base, so an origin rule cannot serve them. A 302 per section can |
| F14 | `ocx.sh` sends `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`; `pages.dev` does not | `curl -I` | The Bunny certificate must be live before traffic moves, and Bunny must send the same header |
| F15 | VitePress URLs have no trailing slash: `/docs/x/` answers 308 with a relative `Location: /docs/x` and no `Cache-Control` | `curl -I` | A proxied page leaks no `pages.dev` host. A 308 is heuristically cacheable (RFC 9110 §15.4.9, RFC 9111 §4.2.2): a browser that follows `/docs/x/` → `/docs/x` now loops once phase 3 adds `/docs/x` → 301 → `/docs/x/`. So the root site links the no-slash form while `/docs/` is legacy (C-306), and the phase-3 slash 301s ship with browser cache 0 at first |
| F16 | The `ocx.sh` zone is on Cloudflare with apex `MX` + SPF `TXT`; `setup.ocx.sh` is already a DNS-only CNAME to Bunny | `dig` | Flip the apex only, as a DNS-only flattened CNAME. Do not move nameservers |
| F17 | Bunny: 50 rules per pull zone, 5 triggers per rule, 5 patterns per trigger; origin actions (`OriginUrl` 2, `OriginStorage` 17, `Redirect` 1) are first-match by `OrderIndex`, header actions stack; 10 hostnames per pull zone; S3 storage zones are public preview, capped at 4 regions, have no `DeleteObjects`, and are settable only at creation; storage replication regions cannot be removed; Seamless Domain Migration issues a certificate before DNS moves (TXT since 2026-04-28, HTTP since 2026-07-14) | bunny.net docs + changelog (research `phase2_bunny.md`) | HTTP-API zones only; explicit rule order; certificate before flip |
| F18 | No maintained Bunny deploy action exists: `R-J-dev/bunny-deploy` was archived 2026-05-24, and `ayeressian/bunnycdn-storage-deploy` wipes the zone before upload | GitHub (research `phase2_deploy.md`) | Own action stays justified |
| F19 | Tags of immutable GitHub releases cannot move, so a floating `v1` conflicts with them | GitHub changelog 2025-10-28 | No floating major tag |
| F20 | Node type stripping is stable from 24.12; the minor that `node24` runners bundle is unverified | nodejs.org/api/typescript.html | Author the action as `.mjs` + JSDoc; probe P3 is retired |
| F21 | The landing's illustrations and feature icons are Icons8 files under `/licensed/`, overlaid from a private R2 bucket at deploy; their licence forbids committing them | `ocx/.github/workflows/deploy-website.yml` | The root site cannot reuse them (AGENTS.md: icons come from Lucide or Simple Icons only) |

## Decision summary

| ID | Decision | Recommendation |
|---|---|---|
| D6.1 | Bunny-as-code tooling | Own zero-dependency Node 24 `.mjs` + JSDoc under `infra/bunny/`. It ports `www-setup/deploy/bunny/edge-rules.py` (plan / apply / verify / zone read-back) and derives rules from `nav.json` plus one committed `infra/bunny/legacy.json`. Terraform stays the fallback |
| D6.2 | Zone topology | Two pull zones, `sh-ocx-dev` and `sh-ocx`, over the same per-repo storage zones `sh-ocx-<repo>`. Storage zones use the HTTP API, never S3. Dev is the staging area for edge-rule and zone changes; previews stage content |
| D6.3 | Apply semantics | Diff by an `ocx:<id>` description: upsert with explicit order, then delete stale `ocx:*` rules, then read back and compare. Never delete all rules and re-add them. Apply dev first, then prod |
| D6.4 | Edge-rule set | **Amended (AM1): registry rules 12–15 dropped, 11 rules on prod.** Generated per zone with that zone's literal hosts: asset cache (2, 200 only), `noindex` on every non-public host (1), HSTS on `ocx.sh` (1), `X-Frame-Options` (1), legacy proxies and redirects (6), registry (4 incl. no-coalescing, conditional), one `OriginStorage` rule per migrated repo. 15 at the flip, plan asserted ≤ 40; apply refuses when live ∪ planned > 50 |
| D7 | Deploy action | A `node24` JS action at `.github/actions/deploy/`, `.mjs` + JSDoc, zero dependencies. Two-phase upload, HTML-only prune, plus a prune cap and a `preview` mode for base-`/` preview sites. Consumers pin the SHA with a `# vX.Y.Z` comment, and no floating major tag exists. Triggers: `push: main`, a daily `schedule`, `workflow_dispatch` |
| D8.1 | Cutover strategy | **Superseded (AM1): option C, the nginx interim; the apex flip waits for end of 2026.** Was: flip DNS early (owner sequence). Legacy edge rules keep every unmigrated URL byte-identical, so the flip is a hosting change with no URL change |
| D8.2 | Unmigrated sections | Proxy path-identical origins (`ocx-website.pages.dev`: `/docs/`, `/schemas/`, their root assets). Send a 302 for path-shifted ones (`/catalog/` → `index.ocx.sh`, the three GitHub Pages sections). A section's legacy entry is deleted in its migration PR |
| D8.3 | Apex DNS | **Deferred (AM1) to OG-C, end of 2026, after the registry leaves hetzner1; the text below stands for that gate.** Cloudflare stays authoritative. The apex becomes a DNS-only flattened CNAME to `sh-ocx.b-cdn.net`, TTL 60 s. The certificate comes first, via Seamless Domain Migration, and the whole checklist is rehearsed with `--resolve` before the flip |
| D8.4 | Registry at the flip | **Closed (AM1): nginx interim. The registry stays on hetzner1 nginx until the server retires; R1, `origin.ocx.sh` and rules 12–15 are dropped.** Was Q1. Default: Bunny rules send `/v2/*` and the token realm to a DNS-only origin hostname on hetzner1 (own server block, own certificate) with `Host: ocx.sh`, no caching and no request coalescing, gated on probe P-C4 on the dev zone. Fallback: ADR 0001 D1.4 option 1 (the nginx interim), with the DNS flip deferred |
| D9 | Root site | `site/` Starlight app at base `/`. It ports the landing and authors `/integrations/`, `/apps/` and `/install/` with a new theme component `HubGrid`. Icons8 art is replaced by Lucide (Q2). `/team` stays on the legacy proxy. Links into `/docs/` use the no-slash form while docs is legacy (F15). Merged search must degrade when bundles are missing; if it cannot, `site/` drops the merge targets that `legacy.json` still claims |
| D10 | Lore | Fold the `ocx-design` design rules into `skills/ocx-theme-theming/references/design-rules.md`. `ocx-site-integration` is already covered by `ocx-theme-setup` + `ocx-theme-deploy`. No new artifact names. ADR 0001 D4 is superseded |
| D11 | Release + CI | `v0.1.0` published by hand (owner), after the deploy skill gains a "do not wire it yet" status line. `ci.yml` gains `zizmor` and `secrets` jobs. New `site.yml` deploys the root site. `previews.yml` deploy is wired. Dependabot with a 7-day cooldown. CODEOWNERS on `nav.json` and `legacy.json` |

---

## Amendment 1 (2026-09-30): DNS stays on Cloudflare, nginx interim

Owner decision, 2026-09-30. It supersedes the early DNS flip (owner decision 1's step "`ocx.sh`
DNS to Bunny", D8.1 A) and closes Q1 (R1 or R2).

1. DNS stays on Cloudflare, and Bunny DNS is never used. The `ocx.sh` apex keeps pointing at hetzner1
   (proxied, as today) until the old server is removed at the end of 2026.
2. hetzner1 nginx keeps serving the OCI registry (`/v2/` and the token realm) locally and changes
   only its `location /` upstream from `ocx-website.pages.dev` to the Bunny prod pull zone `sh-ocx`.
3. Interim topology: Cloudflare DNS (proxied) → hetzner1 nginx → registry locally, everything else →
   Bunny `sh-ocx`. Bunny's edge rules still route the unmigrated sections: proxy `/docs/`,
   `/schemas/` and the F11 root assets to `pages.dev`; 302 `/catalog/` and the GitHub Pages sections.
4. The apex flip to Bunny moves to an end-of-2026 owner gate (OG-C), after the registry leaves
   hetzner1. Its certificate pre-issue, `--resolve` rehearsal and rollback steps (D8.3) move with it.
5. Editing nginx on hetzner1 is an owner step. Agents only read hetzner1 and never edit `*/data/` or
   `sshd_config`.

### D8.1 and D8.4 rescored

The owner-sequence criterion now favours the nginx interim; every other score is unchanged.

| D8.1 option | Owner sequence (0.25) | **Weighted** |
|---|---|---|
| A. Early flip | 1 | 3.05 |
| B. Flip after every section migrated | 1 | 3.35 |
| **C. nginx interim, DNS after the registry leaves** | 5 | **4.50** |
| D. Cloudflare Origin Rules split | 2 | 3.80 |

| D8.4 option | Owner sequence (0.25) | **Weighted** |
|---|---|---|
| R1. Bunny proxies `/v2/` to `origin.ocx.sh` | 1 | 1.90 |
| **R2. Registry stays on hetzner1 nginx until retirement** | 5 | **4.90** |
| R3. Registry on a subdomain | 1 | 1.70 |
| R4. Edge Scripting middleware | 1 | 1.80 |

**D8.4 is closed: nginx interim, and the registry stays on hetzner1 until the server retires.**
Dropped with R1: `origin.ocx.sh` (its server block and certificate), probe P-C4, gate OG-Q1, the
`legacy.json` `registry` block and edge rules 12–15 (`registry-origin`, `registry-host`,
`registry-nocache`, `registry-nocoalesce`). No registry byte crosses Bunny, so the prod zone may carry
a bandwidth cap again. The zone keeps request coalescing off (C-051): it costs little, and the
setting stays pinned by read-back.

### Edge rules after the amendment

| Moment | Prod rules | Live during apply (live ∪ planned) |
|---|---|---|
| OG-N (nginx → Bunny): rules 1–11 | 11 | 11 |
| Docs migration (phase 3): rules 6–7 swap for `repo-ocx`, plus the no-slash, `.html` and `/team` 301s | 11 − 2 + 4 = 13 | 15 |
| Phase-3 end state: rules 1–5, ≤ 5 `repo-*`, 3 docs 301s, the P9 fallback if taken | ≤ 14 | ≤ 15 |
| OG-C apex flip (end of 2026) | no change: prod hosts already include `ocx.sh` | — |

Dev renders one rule fewer (no HSTS), so 10 at OG-N. The plan ceiling (40) and `RULE_LIMIT = 50` stay.

### Consequences of the nginx front

| Topic | Consequence |
|---|---|
| Host and SNI | nginx sends `Host: ocx.sh` and SNI `ocx.sh` (`proxy_ssl_server_name on`, `proxy_ssl_name ocx.sh`) to `sh-ocx.b-cdn.net`. So `ocx.sh` joins the prod pull zone as a custom hostname at OG-P, with its certificate from Seamless Domain Migration (TXT, no traffic change), and nginx verifies it. The edge rules then see the same host now and after OG-C. Probe P-N1 confirms it. Fallback 1: SNI `sh-ocx.b-cdn.net` (Bunny's own certificate) with `Host: ocx.sh`, if Bunny cannot keep the `ocx.sh` certificate renewed while DNS stays on Cloudflare. Fallback 2: Host and SNI `sh-ocx.b-cdn.net`; the prod zone then renders no `noindex` rule (below) |
| Redirect `Location`s | Every redirect a rule emits is an absolute `https://…` URL. A same-site redirect (the phase-3 slash 301s) names the zone's public host literally, `https://ocx.sh/…` on prod, and never uses a Host-derived or `*.b-cdn.net` target. `bunny:plan` refuses a Redirect target on a `*.b-cdn.net` host of a prod rule. nginx adds `proxy_redirect https://sh-ocx.b-cdn.net/ https://ocx.sh/;` as a safety net. `cutover:verify` fails on any `b-cdn.net` host in a `Location`, `Link`, canonical or `og:url` served for `ocx.sh` |
| Client IP | Bunny sees every visitor as hetzner1 (one IP, one POP near hetzner1). Bunny logs carry no client IP, so client analytics come from Cloudflare and nginx logs. The prod zone gets no per-IP rate limit, Shield rate limit or IP block: it would throttle every visitor at once. Geo POP choice only starts to matter at OG-C (P-C3) |
| HSTS and security headers | They stay at nginx in the interim. HSTS comes from `share/ssl-security.conf` (the local mirror shows it; D8.5's "Cloudflare edge" attribution was incomplete). CSP, `X-Frame-Options` and `X-XSS-Protection` come from the `ocx.sh` server block. Bunny still sends rules 4 (HSTS on `ocx.sh`) and 5 (`X-Frame-Options`), because at OG-C they must already be proven. nginx hides both from the Bunny response (`proxy_hide_header`), so each header appears exactly once. D8.5's CSP and XSS drops take effect only at OG-C |
| Double caching | nginx has no `proxy_cache` (local mirror) and passes `Cache-Control` through unchanged. It must stay so. Cloudflare keeps its default cache, which honours origin `Cache-Control` for static extensions. The OG-N checklist confirms that no Cloudflare cache rule, Edge TTL override or non-"respect existing headers" Browser Cache TTL applies to `ocx.sh`. A Bunny purge does not purge Cloudflare, which is harmless: hashed assets are immutable and HTML is not cached there |
| `noindex` | The `noindex` rule keys on a hostname trigger, `https://<host>/*` for each host in H(Z) − {`ocx.sh`}. A request that arrives through nginx carries `Host: ocx.sh` and never matches it; `sh-ocx-dev.b-cdn.net` and `sh-ocx.b-cdn.net` always do. Under fallback 2 the prod zone renders no `noindex` rule and only the dev zone keeps it |
| Rollback | OG-N rolls back by reverting the `location /` upstream and reloading nginx. It takes seconds and needs no DNS change or certificate. The hetzner1 `ocx.sh` certificate keeps renewing by HTTP-01 as today, so D8.3's rollback deadline applies only from OG-C |
| hetzner1 in the HTML path | hetzner1 stays in the HTML path until OG-C, as ADR 0001 had it (A3, A11 revert) |

Owner reference for OG-N. This is config, not applied: it replaces only `location /` in
`ocx-sh-00.conf`, and the two registry locations stay as they are.

```nginx
location / {
    set $bunny sh-ocx.b-cdn.net;        # variable: re-resolved via the http-level `resolver`
    proxy_pass https://$bunny;          # no URI part: the request URI passes unchanged
    proxy_set_header Host ocx.sh;       # hostname trigger: ocx.sh rules, never noindex
    proxy_ssl_server_name on;
    proxy_ssl_name ocx.sh;              # SNI; certificate from Seamless Domain Migration (OG-P)
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;  # path per image
    proxy_redirect https://sh-ocx.b-cdn.net/ https://ocx.sh/;          # safety net
    proxy_hide_header Strict-Transport-Security;  # nginx's ssl-security.conf copy stays
    proxy_hide_header X-Frame-Options;            # the server block's copy stays
    # no proxy_cache: Bunny's Cache-Control passes through
}
```

Rehearsal before the switch: a temporary server block `next.ocx.sh` (DNS-only A record to hetzner1,
HTTP-01 certificate by `task cert:create DOMAINS=next.ocx.sh`) copies `ocx-sh-00.conf` with this
`location /`. `cutover:verify -- --host next.ocx.sh --registry` must be green. The block is removed
after OG-N.

### Probe changes

| ID | Change |
|---|---|
| P-C4 | dropped with R1 |
| P-N1 (new, at the OG-N rehearsal) | through the `edge.ocx.sh` nginx vhost (Amendment 2): Bunny serves `Host: ocx.sh` with SNI `ocx.sh` and a certificate that nginx verifies; no `X-Robots-Tag` on `ocx.sh`; HSTS and `X-Frame-Options` appear once each; no `b-cdn.net` in any `Location`. After Bunny's first renewal window, the `ocx.sh` certificate on Bunny has more than 30 days left. Fallbacks 1, then 2, of the Host row above |
| P-C1 | unchanged, at OG-P: it now gates OG-N as well as OG-C |
| P-C3 | moves to OG-C |

### Rollout rows replaced

| Step | Who | Action | Gate to proceed | Rollback |
|---|---|---|---|---|
| OG-Q1 | — | **superseded** (D8.4 closed) | — | — |
| OG-P | owner | `bunny:zone:apply` and `bunny:apply -- --zone prod`; add hostname `ocx.sh` by Seamless Domain Migration (TXT in Cloudflare, no traffic change); Force SSL | certificate active; `cutover:verify -- --host ocx.sh --resolve <bunny ip>` green | remove the hostname |
| OG-N (new) | owner | Cloudflare cache audit (above); `next.ocx.sh` rehearsal block; `cutover:verify -- --host next.ocx.sh --registry`; then switch `ocx.sh` `location /` to the snippet and reload nginx | `cutover:verify -- --host ocx.sh --registry` green through the public path; 48 h watch (nginx and Bunny logs, Search Console) | revert `location /` to `ocx-website.pages.dev` and reload nginx (seconds) |
| OG-C (deferred, end of 2026) | owner | after the registry leaves hetzner1: the D8.3 checklist (Cloudflare audit and SSL mode, zone export, hetzner1 `ocx.sh` certificate renewed and its expiry recorded), `--resolve <bunny ip>` rehearsal rerun, apex → DNS-only CNAME `sh-ocx.b-cdn.net`, TTL 60 s | `cutover:verify -- --host ocx.sh --dns` from the public internet; 48 h watch | restore the exported records before the recorded certificate expiry |
| OG-T | owner | after two stable weeks past OG-C: TTL 1 h, P-C3, hetzner1 retired | nginx logs show no `ocx.sh` traffic | as OG-C, within the certificate deadline |

The `pages.dev` project still retires only after `/docs/` migrates.

---

## D6 Bunny as code

### D6.1 Tooling

| Option | Description |
|---|---|
| A | Own zero-dependency `.mjs` (Node 24 stdlib `fetch`, `crypto`), a port of `edge-rules.py`. Rules derive from `nav.json` claims via `registry.mjs` plus `infra/bunny/legacy.json` |
| B | Terraform `BunnyWay/bunnynet` 0.19.x (`pullzone`, `pullzone_edgerule`, `storage_zone`) |
| C | Official `@bunny.net/cli` plus shell glue |
| D | Dashboard click-ops plus a runbook, with only a verify script in code |

| Criterion (weight) | A | B | C | D |
|---|---|---|---|---|
| Derives rules from the registry, no second source (0.25) | 5 | 2 (external data source) | 2 | 1 |
| Secret hygiene (0.20) | 5 | 2 (storage passwords land in state) | 4 | 5 |
| Safe apply: no zero-rule window, read-back (0.20) | 5 | 4 | 2 (no rule-set-from-spec) | 2 |
| Offline testable in this toolchain (0.20) | 5 (Vitest, recorded fixtures) | 3 (new binary, hard to fake) | 2 | 1 |
| Maturity / effort (0.15) | 3 (we own it; www-setup proved the shape: 9 rules, 26/26 probes) | 4 | 2 (31 stars, young) | 4 |
| **Weighted** | **4.70** | 2.90 | 2.40 | 2.45 |

**Recommend A.** Runtime code is `.mjs` + JSDoc, checked by `tsc --checkJs` like `packages/theme/src`.
Tests are `.test.ts`, already in the `vitest.config.ts` and `tsconfig.json` globs. Every task that
reads `BUNNY_API_KEY` refuses to run when `CI` is set, judged on an explicit `env` object that only
the CLI `main` fills from `process.env` (GitHub Actions sets `CI=true` for the unit tests too). The
HTTP client and the storage client redact `AccessKey` from every error and log line. The key comes
from a gitignored `.env`, loaded by a **task-level** `dotenv: ['.env']` on exactly the targets that
read it (`apply`, `zone:apply`, `onboard`, `purge`, `gc`). Task 3.53.1 rejects a top-level `dotenv`
in an included Taskfile ("Included Taskfiles can't have dotenv declarations"), and `test`, `plan`,
`verify`, `old-urls` and `cutover-verify` never need the key. `.env.example` lists the names with
empty values. Reversibility: two-way. The same rule list can later feed Terraform.

### D6.2 Zone topology (dev, prod, previews)

| Option | Description |
|---|---|
| i | One pull zone. Dev is its `b-cdn.net` host, and prod adds `ocx.sh` later (ADR 0001 shape) |
| ii | Two pull zones (`sh-ocx-dev`, `sh-ocx`) over shared per-repo storage zones |
| iii | Two pull zones, each with its own per-repo storage zones (full environment split) |
| iv | No dev zone; previews stand in for dev |

| Criterion (weight) | i | ii | iii | iv |
|---|---|---|---|---|
| Fits the owner sequence (dev zone, then prod zone) (0.30) | 2 | 5 | 5 | 1 |
| Rule and zone changes staged before prod, also after the flip (0.25) | 1 | 5 | 5 | 2 |
| One key and one deploy per repo (0.25) | 5 | 5 | 1 (two keys, two deploys) | 4 |
| Cost / ops (0.20) | 5 | 4 | 2 | 4 |
| **Weighted** | 3.10 | **4.80** | 3.40 | 2.60 |

**Recommend ii** (Q3 asks whether the owner meant separate dev content).

| Zone | Kind | Hosts | Default origin | Notes |
|---|---|---|---|---|
| `sh-ocx-dev` | pull | `sh-ocx-dev.b-cdn.net` | `sh-ocx-website` | every response `X-Robots-Tag: noindex, nofollow`. Rules are applied here first |
| `sh-ocx` | pull | `sh-ocx.b-cdn.net`; `ocx.sh` added at cutover step C3 | `sh-ocx-website` | `noindex` only on the `b-cdn.net` host |
| `sh-ocx-<repo>` | storage, HTTP API | — | — | one per claiming repo (`zoneName()`), created by `bunny:onboard`, files under the full public path |
| `sh-ocx-preview-<slug>` | pull | `sh-ocx-preview-<slug>.b-cdn.net`; `<slug>.preview.ocx.sh` later (one certificate each, well under 10 hostnames) | `sh-ocx-preview-<slug>` | previews build at base `/`, so each site gets its own pull zone; `noindex` on every host |
| `sh-ocx-preview-<slug>` | storage, HTTP API | — | — | one per `scripts/previews/sites.mjs` entry |

The primary region and replication regions are one constant in `infra/bunny/zones.mjs`, copied from
`sh-ocx-setup`. Replication regions cannot be removed later (OW8). Zones are found by name at each
run, so no zone-ID state file exists. If probe P1 fails, fallback C of ADR 0001 D1.2 applies: per-repo
pull zones plus `OriginUrl`. The rule generator switches only the action type.

### D6.3 Apply semantics

www-setup's apply deletes every rule and then re-adds them. On a live `ocx.sh` that window drops the
legacy proxies and the registry. **Decision:** every generated rule carries a unique
`Description = ocx:<id>`. Apply lists the zone, then:

1. upserts each planned rule with an explicit `OrderIndex` (longest path first), so a rule replacing
   a legacy rule wins before the old one is gone;
2. deletes the `ocx:*` rules the plan no longer names (it never touches rules without the prefix);
3. reads the zone back and exits 1 if any field or the order differs from the plan.

Because step 1 runs before step 2, the zone briefly holds live ∪ planned rules. Apply exits 1
before any write when that union exceeds `RULE_LIMIT = 50` (Bunny's per-zone limit, F17).
`--dry-run` prints the diff. Zone settings follow www-setup: POST partial, GET, and compare every
field, because the API answers 200 for a body it partly ignores (`OriginRetryDelay` is an enum). Dev
is applied and verified before prod. The runbook orders it; no code enforces it (ponytail: a
plan-hash handshake between zones is added if a prod apply ever skips dev).

### D6.4 Edge-rule set and budget (prod zone at the flip)

Hosts are literal per zone. A `*` sits in the host position only in rules 1–2, whose intent is every
path. Patterns chunk at 5 per trigger and 5 triggers per rule. Origin rules sort longest path first.

| # | `ocx:` id | Patterns (`H` = the zone's hosts) | Action | Rules |
|---|---|---|---|---|
| 1–2 | `assets-edge`, `assets-browser` | `https://*/_astro/*`, plus a second trigger `StatusCode` = 200 (match type All) | cache 31536000 s at the edge and in the browser (C-049). The status trigger keeps a transient 404 on a hashed URL (replication lag, `bunny:gc`, a consumer rollback) from being pinned in browsers for a year | 2 |
| 3 | `noindex` | `H − {ocx.sh}` × `/*` | Set Response Header `X-Robots-Tag: noindex, nofollow` | 1 |
| 4 | `hsts` | `ocx.sh` × `/*` (prod only) | Set Response Header `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (F14) | 1 |
| 5 | `frame` | `H` × `/*` | Set Response Header `X-Frame-Options: SAMEORIGIN` (F10) | 1 |
| 6 | `legacy-ocx-dirs` | `H` × `/docs/*`, `/schemas/*`, `/assets/*`, `/icons/*`, `/casts/*`, `/licensed/*`, `/team`, `/team/*` | `OriginUrl https://ocx-website.pages.dev` (bare, so the path is kept: probe P7) | 1 |
| 7 | `legacy-ocx-files` | `H` × `/logo.svg`, `/favicon.ico`, `/apple-touch-icon.png`, `/site.webmanifest`, `/vp-icons.css`, `/hashmap.json` | same | 1 |
| 8 | `legacy-catalog` | `H` × `/apps/catalog`, `/apps/catalog/*` | Redirect 302 `https://ocx-sh.github.io/catalog/%{Path.2-}` | 1 |
| 9 | `legacy-rules-ocx` | `H` × `/integrations/bazel`, `…/*` | Redirect 302 `https://ocx-sh.github.io/rules_ocx/%{Path.2-}` | 1 |
| 10 | `legacy-ocx-sdk-python` | `H` × `/integrations/python`, `…/*` | Redirect 302 `https://ocx-sh.github.io/ocx-sdk-python/%{Path.2-}` | 1 |
| 11 | `legacy-index` | `H` × `/catalog`, `/catalog/*`, `/catalog.html` | Redirect 302 `https://index.ocx.sh/%{Path.1-}` (reproduces F12) | 1 |
| 12–15 | **dropped (AM1)** `registry-origin`, `registry-host`, `registry-nocache`, `registry-nocoalesce` | `H` × `/v2`, `/v2/*`, `/artifactory/api/docker/sh-ocx-oci-prod/*` | `OriginUrl https://<registry origin host>`; Set Request Header `Host: ocx.sh`; Override Cache Time 0; Disable Request Coalescing. Present only while `legacy.json` has a `registry` entry (D8.4) | 4 |
| — | `repo-<name>` | `H` × each claim `c`, `c*` | `OriginStorage sh-ocx-<name>`, one per repo that has no legacy entry | 0 now, ≤ 5 at the end of phase 3 |
| | **At OG-N: 11 (AM1; was 15 at the flip). Plan ceiling asserted: 40. Apply refuses live ∪ planned > 50 (D6.3)** | | | |

Why rule 15 and zone-level coalescing off (C-051): Bunny merges simultaneous uncached requests into
one origin fetch and hands that response to every waiter (bunny.net/docs/cdn/request-coalescing).
Cache time 0 does not stop it, because coalescing acts on in-flight requests. Two users fetching a
token or a private manifest at once could get each other's response. The zone runs with coalescing
off, and rule 15 keeps the registry safe if a dashboard toggle turns it back on. The site loses
little: `_astro/` and `pagefind/` assets are long-cached, so uncached bursts are rare.

Rule count over time (prod zone; dev has one rule fewer, no HSTS). *Superseded by the table in
[Amendment 1](#edge-rules-after-the-amendment), which drops rules 12–15:*

| Moment | Rules | Live during apply (live ∪ planned) |
|---|---|---|
| Flip, R1 | 15 | 15 |
| Docs migration (phase 3): rules 6–7 swap for `repo-ocx`, plus the no-slash → slash and `.html` → slash 301s and a `/team` 301 | 15 − 2 + 4 = 17 | 19 |
| Phase-3 end state, registry still on `ocx.sh`: rules 1–5, ≤ 5 `repo-*`, 3 docs 301s, rules 12–15, the P9 fallback if taken | ≤ 18 | ≤ 19 (one swap at a time) |

HANDOVER's "20 edge rules per pull zone" is stale; the limit is 50 (F17).

Dev renders the same list with `H = {sh-ocx-dev.b-cdn.net}` and no rule 4. A preview zone renders
rules 3 and 5 only. The generator refuses (exit 1) when an `OriginUrl` target host is one of our own
zone hosts: after the flip, a proxy to `ocx.sh` loops. Directory index, 404 and Force SSL cost no
rule: they come from storage-zone and hostname settings. Probe P1 confirms the index and 404
behaviour under `OriginStorage`. No rule routes `/.well-known/acme-challenge/*`: Bunny renews its own
`ocx.sh` certificate through that path after the flip.

---

## D7 Deploy action

| Option | Fits the consumer env/secret model (0.20) | Own code at the pinned ref (0.20) | Testability (0.25) | Runtime certainty (0.20) | Supply chain (0.15) | **Weighted** |
|---|---|---|---|---|---|---|
| A. **`node24` JS action, `.mjs` + JSDoc**, `index.mjs` → `deploy.mjs` + `storage.mjs` | 4 | 5 | 5 | 5 | 5 | **4.80** |
| B. `node24` JS action in `.ts` via type stripping (ADR 0001 D3, probe P3) | 4 | 5 | 5 | 2 (F20) | 5 | 4.20 |
| C. Reusable workflow (`workflow_call`) | 5 | 2 | 3 | 5 | 4 | 3.75 |
| D. Third-party action (F18) | 4 | 5 | 1 | 4 | 1 | 3.00 |

**Recommend A.** The ADR 0001 D3 contract (§3.2–3.4: validate, check, list, phase 1, phase 2, prune
HTML only, no purge) stays. The deltas:

| Topic | Decision | Why |
|---|---|---|
| Language | `.mjs` + JSDoc; P3 retired | F20; matches `packages/theme/src` |
| Storage client | `storage.mjs` (list with ≤ 5 concurrent listings, PUT with `Checksum`, DELETE). It is shared with the owner-local `bunny:gc` by relative import and never sends `allowRootDelete`. DELETE goes only to a listed entry with `IsDirectory === false` whose URL does not end in `/`, because a DELETE on a directory removes the whole tree. It redacts `AccessKey` from every thrown error (`gc` runs owner-local, where `::add-mask::` does nothing) | one implementation of the Bunny storage semantics |
| Prune guards | (a) no DELETE after any failed upload (C-039); (b) exit 1 with zero DELETEs when the prune would remove more than half of ≥ 10 listed HTML files, unless `force-prune: true`; (c) never delete non-HTML (C-041) | rclone's `--max-delete` rule; a bad scheduled build must not prune a section |
| Preview mode | input `preview: <site>` (a `sites.mjs` name): zone `sh-ocx-preview-<slug>`, path `/`. It skips the claim and layout checks (previews build at base `/`) but keeps `index.html`, checksums, ordering and prune. Without `preview`, a zone name starting `sh-ocx-preview-` is rejected; with it, a `path` input is rejected | preview and production share one code path, and production validation is untouched. The key is per zone anyway, so the credential is the real fence |
| Triggers (consumer template) | `push: main`, daily `schedule`, `workflow_dispatch`. A repo whose docs must track releases decides that in its phase-3 plan. GitHub disables `schedule` after 60 days without repository activity in a public repo, so the daily run is a self-heal, never the correctness path; the skill's failure modes name `gh workflow enable` | ADR 0001 D3: a Dependabot merge made with `GITHUB_TOKEN` fires no push run. `skills/ocx-theme-deploy` says "tag or dispatch" today; a status line and the dropped tag trigger land before OG-R (D11), the full rewrite in the same commit as the action |
| Environment | `ocx.sh` (consumers and this repo's root deploy), `previews` (this repo's previews). Deployment branch `main` | keeps ADR 0001 and the skill's name; zizmor `secrets-outside-env` |
| Versioning | same `vX.Y.Z` train as the theme; `0.x` now; **no floating major tag**; consumers pin the full SHA with `# vX.Y.Z` | F19; SHA pinning is the only immutable reference |
| Purge | none in CI (ADR 0001 D1.3 unchanged) | the account key stays local |

Reversibility: two-way. The action is versioned, and a consumer reverts its pin.

---

## D8 Cutover

### D8.1 Strategy

| Option | Description |
|---|---|
| A | **Early flip (owner sequence):** DNS → Bunny before consumers migrate. Legacy edge rules serve unmigrated sections |
| B | Flip after every section has migrated (HANDOVER phase 4) |
| C | nginx interim (ADR 0001 D1.4 option 1): Cloudflare → hetzner1 → Bunny; DNS moves later |
| D | Cloudflare stays proxied; Cloudflare Origin Rules split the registry → hetzner1 and the rest → Bunny |

| Criterion (weight) | A | B | C | D |
|---|---|---|---|---|
| Owner sequence (0.25) | 5 | 1 | 2 | 2 (DNS does not move to Bunny) |
| URL continuity / SEO (0.20) | 4 (URL-neutral; legacy rules) | 5 | 5 | 5 |
| Registry risk (0.20) | 3 (D8.4) | 3 (same question, later) | 5 | 5 |
| Rollback (0.15) | 4 (one record, TTL 60 s, until the hetzner1 `ocx.sh` certificate expires) | 4 | 5 | 4 |
| hetzner1 out of the HTML path (0.10) | 5 | 5 | 1 | 5 |
| Simplicity (0.10) | 3 | 4 | 4 | 2 (rules outside code; host override per plan: verify) |
| **Weighted** | **4.05** | 3.35 | 3.75 | 3.80 |

**Recommend A.** On technical criteria alone C and D rank higher (re-weighted without the owner
sequence: D 4.40, C 4.33, A 3.73). A is chosen because the owner sequence is binding, and C remains
the registry fallback. What A does keep: the flip changes no URL (Google's "move without URL change"). The URL change, when `/docs/x` gains a trailing slash, happens per
section in phase 3 with 301 rules. C is the fallback when the registry blocks the flip (D8.4).

### D8.2 Unmigrated sections

| Option | URL continuity (0.30) | No broken assets (0.30) | Rule budget / simplicity (0.20) | Clean end state (0.20) | **Weighted** |
|---|---|---|---|---|---|
| a. Proxy every legacy section (`OriginUrl`) | 4 | 1 (F12, F13: path-shifted origins load the wrong root assets) | 4 | 4 | 3.10 |
| b. 302 every legacy section to its current host | 2 (docs readers leave `ocx.sh`) | 5 | 5 | 4 | 3.90 |
| c. **Proxy path-identical, 302 path-shifted** | 5 | 5 | 4 | 4 | **4.60** |
| d. `pages.dev` as the pull zone's default origin, root site routed by `OriginStorage` | 5 | 5 | 3 (root top-level files enumerated) | 2 (default origin flips again later) | 4.00 |

**Recommend c.** `infra/bunny/legacy.json` holds one entry per legacy origin (`id`, `repo`,
`mode: proxy|redirect`, `origin`, `paths`, and the optional `registry` block). A repo with a legacy
entry gets no `OriginStorage` rule. Its phase-3 migration PR deletes the entry, and `bunny:apply`
then swaps the rule without a gap (D6.3). 302, not 301: these redirects are temporary, and a 301
would teach search engines the wrong target. The catch-all is the root zone: an unknown path gets the
root site's 404. Missed legacy paths are caught before the flip by `infra/old-urls.txt`, which is
seeded by crawling the live site, because `ocx.sh` has no sitemap (research `phase2_cutover.md`).
An offline test (plan C-333) checks every seed path against `site/dist` and the legacy rules, so a
miss shows up in CI, not first at OG-D. A path the crawl finds that no entry covers is added to
`legacy.json` through a Spec Delta.

### D8.3 Apex DNS

| Option | URL-neutral (0.25) | Blast radius: mail, subdomains (0.25) | Certificate before traffic (0.20) | Rollback (0.20) | Geo steering (0.10) | **Weighted** |
|---|---|---|---|---|---|---|
| A. **Cloudflare DNS, apex DNS-only flattened CNAME → `sh-ocx.b-cdn.net`, TTL 60 s, certificate by Seamless Domain Migration** | 5 | 5 | 5 | 5 | 3 (flattening may skew POP choice: P-C3) | **4.80** |
| B. Move the zone to Bunny DNS | 5 | 1 (MX, SPF, `index`/`lore`/`dev`/`setup` records move) | 5 | 2 | 5 | 3.40 |
| C. Canonical `www.ocx.sh` CNAME + apex redirect | 1 | 4 | 5 | 4 | 5 | 3.55 |

**Recommend A.** B remains a later, separately rehearsed change if P-C3 shows a region is served
from a distant POP. Before the flip: export the Cloudflare zone (BIND), keep Universal SSL on so the
rollback record has a certificate, record the Cloudflare SSL mode, and audit every Cloudflare rule
scoped to `ocx.sh` (it stops applying once the record is DNS-only).

Rollback has a deadline. hetzner1 renews its `ocx.sh` certificate by HTTP-01 webroot; after the flip
the challenge lands on Bunny, so that certificate stops renewing. Under Cloudflare Full (strict) a
restored proxied record then answers 526. The runbook renews it right before OG-C and records its
expiry as the rollback deadline. A rollback after that date first re-issues the certificate by
DNS-01. An ACME edge rule is not an option (D6.4: Bunny renews its own certificate on that path).

### D8.4 The OCI registry at the flip (Q1, closed by Amendment 1: R2)

`https://ocx.sh/v2/` (401, `Bearer realm="https://ocx.sh/artifactory/api/docker/sh-ocx-oci-prod/v2/token",service="ocx.sh"`)
is JFrog behind hetzner1. ADR 0001 let DNS move only after the registry is removed. The owner
sequence moves DNS before that.

| Option | Description |
|---|---|
| R1 | Bunny rules 12–15: `OriginUrl` to a new DNS-only hostname on hetzner1 (proposed `origin.ocx.sh`), `Host: ocx.sh` so JFrog emits an unchanged realm, no caching and no request coalescing. `origin.ocx.sh` gets its **own** server block with its own HTTP-01 certificate (`task cert:create DOMAINS=origin.ocx.sh`; its DNS points at hetzner1, so HTTP-01 works) carrying only the two registry locations and 404 for everything else. It is never a SAN of the `ocx.sh` certificate, which stops renewing after the flip (D8.3). Bunny sends SNI `origin.ocx.sh` and `Host: ocx.sh`; P-C4 confirms which block nginx routes to |
| R2 | Keep the registry off Bunny: run the nginx interim (option C of D8.1) and defer the DNS flip until the registry is removed |
| R3 | Move the registry to a subdomain before the flip |
| R4 | Bunny Edge Scripting middleware |

| Criterion (weight) | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| Registry risk: pulls, auth, multi-GB blobs (0.35) | 2 (authenticated responses cross a coalescing CDN; 4 once rule 15, zone coalescing off and P-C4 pass) | 5 | 1 (breaks every `ocx.sh/<ns>/<pkg>` ref, OW3) | 2 |
| Owner sequence (0.25) | 5 | 1 | 4 | 5 |
| Rollback (0.15) | 3 (DNS rollback bounded by the `ocx.sh` certificate, D8.3) | 5 | 1 | 3 |
| Bandwidth coupling: blob bytes on the site's zone (0.15) | 2 | 5 | 5 | 2 |
| Simplicity (0.10) | 2 (extra server block, certificate, rule) | 4 | 2 | 1 |
| **Weighted** | 2.90 (3.60 after P-C4) | **3.90** | 2.45 | 2.80 |

R2 leads on score, by 0.30 even after P-C4. R1 is the default only because the owner sequence is
binding: DNS moves before the registry leaves `ocx.sh`, and R2 defers that move. **Default: R1
behind two gates:** P-C4 passes on the dev zone (`docker pull` of a multi-hundred-MB image,
`ocx install`, and the concurrency checks of the probe table, all through `sh-ocx-dev.b-cdn.net`),
and the prod pull zone
has **no hard monthly bandwidth cap**, only a billing alert, because tripping a cap would take down
the registry with the site. If either gate fails or the owner prefers it, R2 applies: the site still
moves to Bunny through hetzner1, and only the DNS flip waits.

### D8.5 Headers and hygiene Bunny must reproduce

| Today (source) | On Bunny |
|---|---|
| HSTS preload header (Cloudflare edge) | rule 4, `ocx.sh` only |
| `X-Frame-Options: SAMEORIGIN` (nginx) | rule 5 |
| CSP `default-src 'self' http: https: data: blob: 'unsafe-inline' 'wasm-unsafe-eval'`, `X-XSS-Protection` (nginx) | dropped: this CSP allows every https origin, and the XSS header is deprecated. A real CSP is a separate decision |
| `http://` → `https://` 301 (Cloudflare) | Force SSL on every pull-zone hostname |
| managed `robots.txt` "content signals" text (Cloudflare) | dropped. The root site ships its own `robots.txt` with a `Sitemap:` line |
| `/catalog*` 302 (Pages `_redirects`) | rule 11 |

---

## D9 Root site (`site/`)

- Starlight app at base `/`, `trailingSlash: 'always'`, `ocxTheme()`, and workspace
  `@ocx-sh/theme`. Pages: `/` (port of `ocx/website/src/index.md`: hero, 5-shell install tabs, 4
  feature cards, integrations list, 5 "how it works" `FeatureSection`s, the early-development
  banner), `/integrations/` and `/apps/` (new `HubGrid` from `nav.json` hubs), `/install/` (new;
  the same install data module as the landing, the `setup-ocx` action, a link to
  `/docs/installation`), `/404.html`, `robots.txt`, and `sitemap-index.xml`.
- Links into a section served by a legacy proxy use that section's final no-slash form
  (`/docs/getting-started`, not `/docs/getting-started/`), so no browser caches the Pages 308
  (F15). The docs migration PR switches them to the slash form.
- Icons8 art (F21) is not ported. Feature cards take Lucide icons through the theme `Icon`, and
  `FeatureSection`s carry text plus a code block or `Terminal` cast bundled as a hashed asset. A
  top-level `/casts/` directory would break the root claim layout (C-014). Q2 asks whether the owner
  wants licensed art back through a deploy overlay instead.
- `/team` is not ported: it stays on the legacy proxy (rule 6) and moves or retires with the docs
  migration. No new claim is added.
- Merged search: `mergeTargets(nav, '/')` names bundles that do not exist yet (they 404 or redirect
  during phase 2). An e2e test proves own-section hits still return when merged bundles 404 or
  redirect (replacing probe P6). If Pagefind cannot degrade, the fallback lives in `site/`: it
  filters `mergeTargets(nav, '/')` against the claims `infra/bunny/legacy.json` still lists, at build
  time. `nav.json` and the theme release stay untouched, `legacy.json` stays the one record of
  hosting state, and a migration PR that deletes a legacy entry re-enables that section's search on
  the next root deploy.
- Gates: `site/` joins `APPS`/`DISTS` automatically once `site/package.json` exists. Budgets,
  Lighthouse staging (the site at the stage root beside `docs/`) and Playwright gain the site pages.
  A new budget class needs a Spec Delta.

## D10 Lore

| Option | Verdict |
|---|---|
| a. Build ADR 0001 D4 as designed (`docs/lore/`, rule `ocx-design`, skill `ocx-site-integration`, announce token) | Rejected: two new public names (OW6) and a token, for knowledge that `ocx-theme-setup` and `ocx-theme-deploy` already carry |
| b. **Fold:** `skills/ocx-theme-theming/references/design-rules.md` holds HANDOVER's `ocx-design` rules (coral is the only interactive colour, `accent-fg` for small text, mono for labels, density, corners, shadows, tokens only), linked from that skill's `SKILL.md` | **Recommend.** Cheap, no new name, and it ships on the existing tag train |
| c. Drop it | Rejected: HANDOVER wants the design rules published |

A per-edit rule is added when a consumer agent is seen breaking the design rules with the skill
installed.

## D11 Release and CI

- `v0.1.0`: owner, by hand, per `RELEASING.md` (first publish without provenance, then the trusted
  publisher). Later tags run `release.yml` unchanged, and no floating major tag is created (F19). The
  `ocx-theme-deploy` skill describes an action that `v0.1.0` does not contain yet, and its template
  still deploys on `tags: ['v*']`, against D7. Before OG-R a two-line edit puts a status line at the
  top of `SKILL.md` ("the deploy action ships in a later 0.x; do not wire it yet") and drops the tag
  trigger from the template (plan C-334). Agents read the skill, not the release notes. The release
  that ships the action rewrites the skill.
- `ci.yml` keeps its gate matrix and adds a `zizmor` job (SHA-pinned action, `ocx-sh/*` hash-pinned by
  policy) and a `secrets` job (`task secrets`). `site.yml` builds `site/` and deploys `/` through
  `./.github/actions/deploy` in environment `ocx.sh`. The deploy is skipped until the repository
  variable `BUNNY_DEPLOY` is `true`. `previews.yml` deploys each site with its own secret. Dependabot
  covers npm and github-actions with `cooldown.default-days: 7`. CODEOWNERS covers
  `packages/theme/src/nav.json` and `infra/bunny/legacy.json`.

---

## hetzner1 + Cloudflare inventory outcome

| Served for `ocx.sh` today | By | Phase 2 outcome |
|---|---|---|
| `/` and everything not below | nginx → `ocx-website.pages.dev` | `/`, `/integrations/`, `/apps/`, `/install/`, 404 → root site on Bunny; `/docs/*`, `/schemas/*` and the F11 root assets → legacy proxy rules 6–7 (Pages keeps serving until docs migrates) |
| `/v2/*`, `/artifactory/api/docker/sh-ocx-oci-prod/v2/*` | nginx → JFrog (anchored since `66b2e22`) | stays on hetzner1 nginx until the server retires (AM1) |
| `/catalog*` 302 → `index.ocx.sh` | Pages `_redirects` | rule 11 |
| HSTS, http→https, managed robots | Cloudflare | D8.5 |
| CSP, X-Frame-Options, X-XSS-Protection | nginx | D8.5 |
| `dev.ocx.sh` (Pages `dev` alias + `sh-ocx-oci-dev`) | nginx | **untouched**; not the Bunny dev zone (naming only) |
| `setup.ocx.sh` vhost | nginx (dead: DNS → Bunny) | untouched; out of scope |
| `index`, `lore`, `artifactory`, `grafana`, `sccache`, `bazel-cache`, `otel` | Cloudflare / hetzner1 | untouched by the apex-only flip |

*Superseded by Amendment 1: hetzner1 fronts all `ocx.sh` traffic until OG-C, and `origin.ocx.sh` is
not created.* After the flip, hetzner1 serves `ocx.sh` HTML to nobody. Under R1 the registry reaches it through
`origin.ocx.sh`, whose own server block serves the two registry locations and 404 otherwise, so the
public name exposes no `pages.dev` proxy. The `pages.dev` project retires only after `/docs/`
migrates, not 30 days after the flip (design §2.8 step 7 amended).

## Consequences

- One edge configuration, in code, reviewed as a diff (`bunny:plan` snapshot), applied by the owner
  only. CI never holds an account key.
- Every legacy URL keeps working across the flip. The legacy rule set shrinks as each section
  migrates, and each shrink is one PR plus one apply.
- Dev and prod serve the same content, so a merged deploy is live on both at once. Content preview
  is the job of the preview zones and of PR builds, not of the dev zone.
- ~~Under R1, registry bytes are billed on the site's pull zone~~ (AM1: no registry byte crosses Bunny).
- Until OG-C, every `ocx.sh` request passes Cloudflare and hetzner1 nginx before Bunny (AM1
  consequences table: Host and SNI, absolute redirects, one client IP, headers at nginx, no nginx cache).
- Cloudflare features scoped to the apex (WAF, managed robots, transform rules) end at the flip
  (OG-C, end of 2026), except those D8.5 reproduces.
- The published v0.1.0 deploy skill names the action one release early, behind a "do not wire it
  yet" status line (D11).
- OG-N rolls back in seconds by reverting one nginx `location`. DNS rollback at OG-C is bounded by the
  hetzner1 `ocx.sh` certificate's expiry (D8.3); after it, rollback starts with a DNS-01 re-issue.

## One-way doors

| # | Door | Why irreversible | Mitigation |
|---|---|---|---|
| OW3 (amended) | Apex `/v2/` + token-realm routing | every `ocx.sh/<ns>/<pkg>` ref, shipped clients | AM1: routing unchanged on hetzner1 nginx until the registry is removed; OG-C flips only after that |
| OW8 (new) | Storage-zone replication regions | Bunny cannot remove a region later | one constant copied from `sh-ocx-setup`; zones are cheap to recreate (OW7) |
| OW9 (new) | HSTS `preload` on `ocx.sh` | already on the preload path; dropping the header or serving a bad certificate locks out returning visitors | OG-N changes no visitor-facing TLS (nginx keeps HSTS). At OG-C: certificate before the flip (Seamless Domain Migration), `--resolve` rehearsal, rule 4 asserted by `cutover:verify` |
| OW6 (amended) | Lore names | no new name is created (D10) | — |

Everything else here is two-way: rules are re-applied from git, zones are recreated, the action
is pinned per consumer, nginx rolls back in seconds (OG-N), and DNS rolls back within 60 s (OG-C).

## Migration, rollout and rollback

Owner gates (OG) are never agent steps. An agent prepares code, tests and runbooks. Rows OG-Q1, OG-P,
OG-C and OG-T are replaced by [Amendment 1](#rollout-rows-replaced), which adds OG-N.

| Step | Who | Action | Gate to proceed | Rollback |
|---|---|---|---|---|
| Pre-R | agent | deploy-skill status line, tag trigger dropped (plan WP15, C-334) | merged | revert |
| OG-R | owner | publish `@ocx-sh/theme@0.1.0` by hand (RELEASING.md), then configure the trusted publisher | package on npm | deprecate the version |
| Build | agents | Stage B pipelines (plan waves 1–4) | plan gates green | revert the merge |
| M0 | owner | probes P1, P7–P9 on the dev zone and one scratch storage zone; recorded GETs redacted by the `api.mjs` helper | results recorded in the plan | topology fallback C |
| Fold | agent | fold M0's redacted fixtures, enums and any P7/P8 fallback into `infra/bunny/` (plan WP7d) | `bunny:test` and snapshots green | revert the PR |
| OG-D | owner | `ocx-sh/ocx` PR merged (VitePress Home nav item and `logoLink` get `target: '_self'`, so the SPA stops rendering the retired landing from proxied docs); create environments `ocx.sh` and `previews` (branch `main`); `bunny:onboard -- ocx-sh/website`; `bunny:zone:apply -- --zone dev`; `bunny:apply -- --zone dev`; set `BUNNY_DEPLOY=true`; run `site.yml` | `bunny:verify -- --zone dev` and `cutover:verify -- --host sh-ocx-dev.b-cdn.net` green | delete the dev zone |
| OG-Q1 | — | **superseded (AM1)**. Was: answer Q1. If R1: create `origin.ocx.sh` (DNS-only) with its own server block and HTTP-01 certificate (registry locations only, 404 otherwise), add `registry` to `legacy.json`, run P-C4 on dev | P-C4 passes | remove the registry entry and apply (rules gone) |
| OG-P | owner | `bunny:zone:apply` + `bunny:apply -- --zone prod`; add hostname `ocx.sh` by Seamless Domain Migration (TXT in Cloudflare, no traffic change); Force SSL | certificate active; `cutover:verify -- --host ocx.sh --resolve <bunny ip>` green; soak ≥ 3 days with lychee over `old-urls.txt` | remove the hostname |
| OG-C | owner | Cloudflare audit and SSL mode → `infra/cutover/README.md`; export the zone; renew the hetzner1 `ocx.sh` certificate and record its expiry; apex → DNS-only CNAME `sh-ocx.b-cdn.net`, TTL 60 s | `cutover:verify -- --host ocx.sh --dns --registry` from the public internet; 48 h watch (Bunny logs, Search Console, nginx logs) | restore the exported records (≤ 60 s TTL), before the recorded certificate expiry; after it, re-issue by DNS-01 first |
| OG-T | owner | after two stable weeks: TTL 1 h; hetzner1 `location /` removed | nginx logs show no `ocx.sh` HTML | revert the nginx edit **and** restore the DNS records (TTL now 1 h), within the certificate deadline |
| OG-V | owner | environment `previews` exists (OG-D); `bunny:onboard -- --preview <site>` ×4; set `PREVIEWS_DEPLOY=true` | `previews.yml` green; each preview URL 200 with `noindex` | delete the preview zones |
| Phase 3 | per-repo plans | each section: onboard → first deploy → PR deleting its `legacy.json` entry (+ for docs: slash-301 rules with browser cache 0 for the first weeks, and root-site `/docs/` links switched to the slash form) → apply dev → verify → apply prod | `bunny:verify` both zones | re-add the legacy entry, apply |

## ADR 0001 amendments

| # | ADR 0001 text | Amend to | Basis |
|---|---|---|---|
| A1 | D1.2 "S3-enabled if P1 passes" | HTTP-API storage zones only | F17 |
| A2 | D1.2 one pull zone `sh-ocx` | pull zones `sh-ocx-dev` + `sh-ocx` over the same storage zones; per-site preview pull and storage zones | D6.2 |
| A3 | D1.4 staged nginx swap, DNS after the registry is removed | **reverted by AM1:** D1.4 option 1 stands (nginx `location /` → Bunny, registry on nginx, DNS after the registry is removed, end of 2026); D8.3 governs that later flip | owner 2026-09-30 |
| A4 | D1.5 `dev.ocx.sh` as staging; "no preview.ocx.sh" | dev = `sh-ocx-dev.b-cdn.net`; `dev.ocx.sh` untouched; previews on `sh-ocx-preview-<slug>.b-cdn.net`, later `<slug>.preview.ocx.sh` | owner 2026-09-30 |
| A5 | D1.6 "no Bunny redirect rules at launch" | four temporary 302 rules (catalog, three GitHub Pages sections), deleted per migration; the rest of D1.6 (index.ocx.sh HTML-only redirect, Pages stubs) moves to phase 3 | D8.2 |
| A6 | D1 secrets: `LORE_ANNOUNCE_TOKEN` | dropped; added `BUNNY_PREVIEW_KEY_<SLUG>` (slug uppercased, `-` → `_`, via `secretName()` in `sites.mjs`) in this repo's `previews` environment | D10, D7 |
| A7 | D3 `.ts` + probe P3, floating `v1`, first release `1.0.0` | `.mjs` + JSDoc, no floating tag, first release `0.1.0`; plus prune cap and `preview` mode | F19, F20, D7 |
| A8 | D4 lore (`docs/lore/`, rule + skill, announce) | superseded by D10 (fold) | D10 |
| A9 | Rollout phases 2, 4, 4b | replaced by the table above | D8 |
| A10 | Probes P1 (S3 part), P3, P4, P6 | P1 without S3; P3 and P4 retired; P6 replaced by the e2e contract C-308 | F17, F20, D10, D9 |
| A11 | Consequence "hetzner1 stays in the HTML path until the DNS move, which waits for registry removal" | **reverted by AM1:** the ADR 0001 text stands | AM1 |

## Probes (block only what they gate)

| ID | Question | Gates | Fallback |
|---|---|---|---|
| P1 (M0) | `OriginStorage` routes `/<prefix>/x` to a second zone with the path kept; `/<prefix>/` and `/<prefix>` serve `index.html`; a miss serves that zone's `bunnycdn_errors/404.html` with 404; the rule JSON shape (`ActionParameter1`) read from a dashboard-made rule | the `repo-*` rules (phase 3); the root zone's 404 at OG-D | topology C |
| P7 (M0) | `OriginUrl https://ocx-website.pages.dev` (bare) keeps the path; the Host reaching Pages is `ocx-website.pages.dev` with the zone's `AddHostHeader: false` (C-051 pins it) | rules 6–7 | full URL with `%{Path.0-}` |
| P8 (M0) | Redirect with `%{Path.1-}` / `%{Path.2-}` keeps the rest of the path and the query string | rules 8–11 | one exact rule per known page (budget) |
| P9 (M0) | `pagefind.js` is served as JavaScript and compressed | C-325 cache and type row | a Content-Type rule (+1) |
| P-C1 | a pull zone serves hostname `ocx.sh` with a valid certificate while DNS still points at Cloudflare | OG-P | classic certificate flow in a low-traffic window, TTL 60 s |
| P-C3 | the flattened apex answer sends visitors to a nearby POP (three regions) | OG-T | later move to Bunny DNS (D8.3 B) |
| P-C4 | **dropped (AM1).** Was: through the dev zone: `/v2/` 401 with the unchanged realm, token 200, `docker pull` of a large image, `ocx install`; two concurrent token GETs with different scope and credentials each return their own token; two concurrent private-manifest GETs under different credentials return distinct responses; a repeated manifest GET is never `CDN-Cache: HIT`; nginx access log shows which server block took `Host: ocx.sh` with SNI `origin.ocx.sh`; `origin.ocx.sh` with its own Host answers 404 outside the registry paths | OG-Q1 → R1 | R2 |

## Open questions

| # | Question | Recommendation |
|---|---|---|
| ~~Q1~~ | **Closed by Amendment 1: R2, registry on hetzner1 nginx until retirement.** Was: the registry at the DNS flip: R1 (Bunny proxies `/v2/` to hetzner1, no hard bandwidth cap on the prod zone) or R2 (nginx interim, DNS waits for the registry's removal)? | **R1, gated on P-C4** on the dev zone, because the owner sequence moves DNS first; R2 scores higher on its own (D8.4). R2 if P-C4 fails or blob traffic must stay off the site's bill |
| Q2 | Landing art: Lucide icons with text, code and casts (no illustrations), or the licensed Icons8 art overlaid at deploy from the private R2 bucket (R2 read credentials in the `ocx.sh` environment)? | **Lucide, no illustrations.** No new CI secret, no load-time asset outside the build, and the AGENTS.md icon rule holds |
| Q3 | Should dev and prod share storage (dev = edge-config staging; content goes live on both at once), or should dev hold its own content (two keys and two deploys per repo)? | **Share.** Content staging is the preview zones' job; a second copy doubles every consumer's secrets and deploy steps |

---

## Amendment 2 (2026-10-04): owner delegation and rehearsal topology

Owner decisions, 2026-10-04, granted in conversation after OG-R (`@ocx-sh/theme@0.1.0` published).
The wording is the plan's "State 2026-10-04 (owner delegation)" paragraph in
[plan_website-buildout.md](../plans/plan_website-buildout.md). Where this amendment and older text
disagree, this amendment wins.

1. **hetzner1 nginx.** The agent edits the hetzner1 nginx config itself (`ssh hetzner`). It never
   touches `*/data/` and never `sshd_config`. The agent also claims the `ocx.sh` certificate. This
   supersedes AM1 item 5 ("Editing nginx on hetzner1 is an owner step").
2. **Local only.** Zone, DNS and certificate steps run on the agent's machine, never in CI, so no
   account-wide key reaches a workflow.
3. **Credentials.** `BUNNY_API_KEY` and `CLOUDFLARE_API_TOKEN` live in the gitignored repo-root
   `.env`. Only the write tasks read it, and they refuse under `CI`.
4. **Rehearsal topology.** `next.ocx.sh` is a DNS-only CNAME straight to Bunny (`sh-ocx.b-cdn.net`).
   It is the end-state rehearsal host: it sits in the prod zone's host set and carries `noindex`.
   The nginx hop is rehearsed on a throwaway `edge.ocx.sh` vhost, and
   `cutover:verify -- --host edge.ocx.sh --registry` runs there. This supersedes AM1's `next.ocx.sh`
   nginx server block (the "Rehearsal before the switch" paragraph), and the matching wording in
   S-123 and the OG-N row.
5. **Storage region.** Storage zones use `REGION` DE only, with no replication. This supersedes the
   D6.2 sentence "copied from `sh-ocx-setup`". OW8 has nothing to guard while no replication region
   is configured.
6. **Zone names.** The storage zone is `sh-ocx-website`. The pull zones are `sh-ocx` and
   `sh-ocx-dev`. Preview zones are `sh-ocx-preview-<slug>`. `bunny:onboard` adopts the zones that
   already exist.

Still open: whether `/v2/` leaves hetzner1 nginx before the end-of-2026 apex flip. The owner has
not decided. The answer decides whether OG-N is dropped for a direct apex flip. AM1's OG-N and OG-C
rows stand until the owner answers.
