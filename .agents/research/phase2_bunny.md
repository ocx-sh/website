# Phase 2 research: Bunny as the static host (axis: bunny)

Date 2026-09-30. Web facts fetched today from bunny.net docs unless a row says otherwise; the
docs carry no per-page dates, so anything load-bearing is marked **PROBE** (verify live in M0).
Earlier trail: `.agents/research/research-domain-bunny.md` (2026-09-27). This file supersedes it
where they differ (S3 zones, proxy sections, dev-host sequence).

## Recommendation (read this, skip the rest)

1. **Keep the design's shape: one pull zone `sh-ocx`, one storage zone per claiming repo, routed by
   `OriginStorage` (action 17) edge rules.** Confirmed to exist in the ActionType enum and in the
   Terraform provider; used in the wild for shared zones. Gate it with probe P1 before WP7 code.
2. **Do not create S3-enabled storage zones** (design 2.2 leans that way). S3 is still *public preview*,
   capped at 4 replication regions, has no `DeleteObjects`, and can only be chosen at zone creation
   (one-way door). The classic HTTP API (PUT + `Checksum`, list, delete) is GA and is all the
   deploy action needs.
3. **Bunny-as-code = own zero-dependency TS on Node 24 stdlib, not Terraform.** Rules are *derived*
   from `nav.json` claims (`registry.mjs`: `claimsOf`, `zoneName`, `mergeTargets`), which Terraform
   cannot do without an external data source; Terraform would also put storage-zone passwords in
   state. Port `www-setup/deploy/bunny/edge-rules.py` (plan / apply / verify / zone read-back).
   The provider is healthy (v0.19.1, 2026-09-24) and is the fallback if the script grows.
4. **Proxying not-yet-migrated sections: proxy only path-identical origins, redirect the rest.**
   `/docs/*`, `/schemas/*` (Cloudflare Pages, same paths) get `OriginUrl` to the pages.dev host.
   `/catalog/*` must be a 302 to `index.ocx.sh/<rest>`: that site (VitePress) uses root-absolute
   `/assets/...` URLs (checked live), so a path-shifted proxy serves broken pages. Same for GitHub
   Pages sections (base differs) until they migrate.
5. **Deploy = own action** (two-phase: assets and pagefind chunks, then HTML, prune only stale HTML).
   No maintained off-the-shelf action fits: `R-J-dev/bunny-deploy` was archived 2026-05-24;
   `ayeressian/bunnycdn-storage-deploy` deletes everything before upload (a live gap);
   Bunny's own CLI / Launcher target single-site setups. Purge is not part of CI: TTL 60 s
   instead; an owner-local `bunny:purge` task covers emergencies.
6. **Cutover of DNS uses Bunny "Seamless Domain Migration"** (new 2026-04-28; HTTP validation
   added 2026-07-14) to get the `ocx.sh` certificate *before* flipping DNS. Cloudflare record must
   be DNS-only (grey cloud).

## Decisions that move versus the current design

| Design says | Change | Why |
|---|---|---|
| 2.2: S3-enabled zones if P1 passes | HTTP-API zones only | preview, 4-region cap, one-way door |
| 2.8 step 2: nginx on hetzner1 fronts `dev.ocx.sh` | Skip. Dev = `sh-ocx.b-cdn.net` directly, plus `X-Robots-Tag: noindex` rule scoped to that host | owner decision 2026-09-30; hostname gets a cert automatically |
| 2.8 step 5/8: DNS waits for registry removal (ADR D1.4) | If the owner's sequence moves DNS first, `/v2/*` and the artifactory path need two edge rules (Change Origin URL + Host) and a large-blob pilot | registry traffic would land on Bunny |
| Budget ≤ 40 of 50 | Add ~3 rules for proxy/redirect of unmigrated sections (see below) | still far below 50 |

## Evidence

### Edge rules: limits, semantics, what fits the design
- Limits: 50 rules per zone, 5 triggers per rule, 5 conditions per trigger, raisable on request;
  500 pull zones per account; 10 hostnames per pull zone. <https://bunny.net/docs/cdn/limits>
  (the old "20 rules" figure in www-setup/HANDOVER is stale).
- ActionType enum includes `OriginUrl`=2, `OriginStorage`=17, `RetryOrigin`=24, `Redirect`=1,
  `SetRequestHeader`=6, `SetResponseHeader`=5, `OverrideCacheTime`=3, `OverrideBrowserCacheTime`=16.
  Origin-layer actions (`OriginUrl`, `OriginStorage`) are short-circuiting: only the first match
  wins; header actions stack. <https://bunny.net/docs/cdn/edge-rules/ordering>
- Order: smallest `OrderIndex` first; unset means creation order. **Set `OrderIndex` explicitly**
  in apply (longest path first). Same page.
- Variables only work in four actions (Change Origin URL, Redirect, Set Request Header, Set
  Response Header), not in trigger patterns. 0-based `%{Path.N}`, `%{Path.N-}`, `%{Path.N-M}`;
  `{{path}}` form handles slashes. <https://bunny.net/docs/cdn/edge-rules/variable-expansion>,
  <https://bunny.net/docs/cdn/edge-rules/dynamic-variables>
- Trigger paths ignore the query string; root-path patterns need the trailing slash;
  `*` matches any character sequence *including `/`* (www-setup measured this too).
  <https://bunny.net/docs/cdn/edge-rules/trigger-path>
- 2026-03-18: Lua-pattern matching in rule conditions (changelog). Consistent with
  `www-setup/deploy/bunny/README.md` ("Lua patterns, not PCRE"). No alternation, so keep the
  host x path cross-product expansion the design already plans.
  <https://bunny.net/docs/cdn/changelog>
- `OriginStorage` works as a per-request override of the pull zone's origin with a shared storage
  zone; no connected pull zone needed on that storage zone.
  <https://dbushell.com/2026/03/04/bunny-shared-storage-zones/>,
  Terraform enum: <https://raw.githubusercontent.com/BunnyWay/terraform-provider-bunnynet/main/docs/resources/pullzone_edgerule.md>
  API field meaning (`ActionParameter1` = storage zone id) is inferred, not quoted: **PROBE**
  by GET-ing a dashboard-made rule and copying its shape.
- `OriginUrl` appends the request path only when the override URL is bare; a URL naming a file
  is fetched verbatim (one real-world test, <https://github.com/brawer/production/pull/41>).
  www-setup's live rule `https://ocx.sh/docs/%{Path.1-}` shows full-URL + variable works
  (`/home/mherwig/dev/www-setup/deploy/bunny/edge-rules.py`, "docs upstream"). **PROBE** both.

### Proxying unmigrated sections
- Pattern: `OriginUrl` to the real host, pull zone "Forward Host Header" off so Host follows the
  origin URL; add `SetRequestHeader: Host` only when an origin needs it.
  <https://bunny.net/docs/cdn/edge-rules/ip-origin>
- Bunny has no SNI override (single third-party note, Vercel case):
  <https://github.com/norgai/norg-edge-mirror-cloudflare-deploy/pull/18>. So the origin URL host
  must be a name the origin serves under its own cert: `*.pages.dev` qualifies.
- **Never point a proxy rule at `ocx.sh`** once DNS is on Bunny (loop). Use the `pages.dev` name.
- `ocx.sh/catalog` today redirects to `index.ocx.sh` (design 2.6); a 302 preserves that behaviour
  and avoids the broken-asset trap. Live check: `curl https://index.ocx.sh/` returns VitePress HTML
  with `href="/assets/style...css"`.
- Budget: `/docs/*`+`/schemas/*` proxy (1 rule), `/catalog/*` redirect (1), one redirect per
  unmigrated GH-Pages claim (<=3). Remove each rule when that repo's first deploy lands: the
  apply script should take "migrated" from whether `sh-ocx-web-<repo>` has `index.html`.

### Static-site mechanics
- Directory index is **contested**: one author says `/page`, `/page/`, `/page/index.html` all
  resolve (<https://dbushell.com/2025/04/27/bunny-cdn-edge-storage/>); Bunny's own docs are silent
  (<https://bunny.net/docs/storage/static-site-hosting>); another author got 404 on folders until
  the generator emitted `index.html` (<https://eventuallymaking.io/p/hosting-a-nuxt-static-site-on-bunny-net>),
  and Quartz users wrote per-folder rules (<https://burgeonlab.com/notes/2026/0909-2358/>).
  Astro emits `dir/index.html` already. **PROBE P1 must request `/docs/`, `/docs`, `/docs/x/`,
  `/docs/x` on an `OriginStorage`-routed zone.** If `/docs` (no slash) serves 200 instead of
  301, Astro's `trailingSlash: 'always'` plus `<link rel=canonical>` covers SEO; do not spend a rule.
- 404 page: storage-zone setting (404 path, optional rewrite to 200), global per zone, not per
  path. Design's `bunnycdn_errors/404.html` upload fits. Whether a zone reached via `OriginStorage`
  uses its *own* error page is **PROBE** (add to P1).
- Replication: uploads hit the primary (Frankfurt for the Edge/SSD tier), then replicate "within a
  couple of seconds"; an unreplicated file is served from the nearest region that has it.
  <https://bunny.net/docs/storage/replication>, <https://support.bunny.net/hc/en-us/articles/360020526159-Understanding-Geo-Replication>.
  Regions cannot be removed after creation: pick once.
- Storage HTTP API: PUT raw body, optional `Checksum` = SHA-256 uppercase hex; list is non-recursive;
  delete is per path; root delete needs `allowRootDelete=true`. <https://bunny.net/docs/storage/http>
- Limits that shape the uploader: 100 concurrent connections per IP per server, 250 per zone per
  server, 5 simultaneous folder listings, 30 simultaneous deletes, 429 with `Retry-After` when hit.
  <https://bunny.net/docs/storage/limits>. The design's 8 parallel PUTs is safe; list at <=5.
- No atomic swap, rename or copy-prefix primitive in the HTTP API. Consistency is by **ordering**
  (assets first, HTML last, prune HTML only), as the design says. A blue/green switch by editing an
  `OriginStorage` rule would need the account key, so it cannot run in CI.

### Cache and purge
- Purge: full zone, by `CDN-Tag`, or by URL/prefix (`POST /pullzone/{id}/purgeCache`, 204).
  Rate limits: exact ~300/min (burst 120), prefix ~30/min (burst 20); tag purge unsupported with
  Perma-Cache. <https://bunny.net/docs/cdn/purge-cache>. All need the account key: never CI.
- Design's 60 s edge TTL + `no-cache` browser + stale-while-updating is the right trade
  (HTML freshness ~2 x TTL with origin shield, per design 2.3). Keep zone settings read-back
  as www-setup does (the API answers 200 for a partly ignored body; `OriginRetryDelay` is an enum).
  `/home/mherwig/dev/www-setup/deploy/bunny/README.md`
- Hashed `_astro/**`: 1 y edge and browser via two rules (design rules 1-2). Pagefind entry files
  (`pagefind.js`, `pagefind-entry.json`) keep the 60 s default; chunks under `index/`,
  `fragment/`, `*.pf_*`, `wasm.*.pagefind` are content-hashed, so the design's "chunks in phase 1,
  prune nothing" is right. Custom extensions (`.pf_fragment`, `.pagefind`) get a generic binary
  type from Bunny; Pagefind fetches them as ArrayBuffer so type is irrelevant. **PROBE**
  `pagefind.js` is served as JavaScript and compressed. Pagefind file list:
  <https://dev.to/dorneanu/add-pagefind-search-to-hugo-k34> (secondary source).
- Pagefind chunk accumulation: nothing prunes them, so storage grows per release. Add a
  monthly owner-local `gc` (design has `gc.mjs`); do not add it to the deploy action.

### Bunny-as-code options
| Option | Verdict | Evidence |
|---|---|---|
| Own TS script (port of `edge-rules.py`) | **Choose** | derives rules from `nav.json`; plan/apply/verify already proven on setup.ocx.sh (9 of 20 rules, 26/26 probes) |
| Terraform `BunnyWay/bunnynet` 0.19.x | Fallback | resources `pullzone`, `pullzone_edgerule`, `pullzone_hostname`, `storage_zone`; `OriginStorage` supported; edge rules ordered by list order; early bug where `${var}` in `parameter1` failed validation ([issue 23](https://github.com/BunnyWay/terraform-provider-bunnynet/issues/23), closed); needs Terraform >= 1.11; storage passwords land in state. <https://docs.bunny.net/terraform/resources>, <https://github.com/BunnyWay/terraform-provider-bunnynet/blob/main/CHANGELOG.md> |
| Official `@bunny.net/cli` (MIT, Bun/Node) | Not for this | storage/sites/DNS/apps commands, 31 stars, 318 commits, no edge-rule-set-from-spec workflow. <https://github.com/BunnyWay/cli> |
| OpenAPI specs (unofficial mirror) | Use for type hints only | <https://github.com/jlarmstrongiv/bunny-sdk-openapi> |

### Deploy tools compared
| Tool | Finding |
|---|---|
| `R-J-dev/bunny-deploy` | checksum skip, delete-stale, purge; **archived and deprecated 2026-05-24**, 13 stars, no rollback. <https://github.com/R-J-dev/bunny-deploy> |
| `ayeressian/bunnycdn-storage-deploy` | `remove: true` wipes storage *before* upload (visible gap; violates "deploys never delete assets"), 88 stars, 7 open issues, retries 5. <https://github.com/ayeressian/bunnycdn-storage-deploy> |
| Bunny Launcher | one-command site deploy with stage config; no documented sync/delete/purge semantics. <https://bunny-launcher.net/commands/deploy/> |
| `rclone`/`aws s3 sync` | only via S3 preview zones: rejected above |
| Own action (design WP10) | needed for claim validation, `ocx-site check`, phase order and HTML-only prune. Reuse `www-setup/scripts/lib/bunny.sh` semantics (Checksum, retry). |

### DNS and certificates
- Free Let's Encrypt for a custom hostname needs a CNAME to Bunny *first* and, on Cloudflare,
  proxy off: <https://bunny.net/docs/cdn/ssl-setup>. Apex: Cloudflare flattens a DNS-only CNAME at
  the apex (Bunny's doc advises a subdomain or Bunny DNS; **PROBE** on the real record).
- **Seamless Domain Migration** issues the certificate before repointing, validated by DNS TXT
  (2026-04-28) or an HTTP challenge file (2026-07-14). <https://bunny.net/docs/cdn/changelog>.
  Use it for `ocx.sh`. Wildcards only free on Bunny DNS; `*.preview.ocx.sh` therefore needs an
  uploaded wildcard certificate (or per-host certs, at most 10 hostnames per pull zone).
  <https://bunny.net/docs/cdn/ssl-setup>
- Dev/indexing: `X-Robots-Tag: noindex` set by a response-header edge rule scoped to the
  `*.b-cdn.net` host (<https://stew.au/musings/prevent-search-index-bunny-storage-zones/>).

### Previews
- Same setup hosts them: one pull zone (`ocx-preview`) whose rules map hostnames (or a path prefix)
  to `sh-ocx-web-preview-<slug>` storage zones. With 10 hostnames per zone and 4 preview sites,
  fine. Dev uses b-cdn hostnames, no DNS. Per-preview storage key in the `previews` environment
  matches `previews.yml`'s note (no account key in CI).
- Previews build at base `/` (not a claim path), so they need their own pull zone: the main
  zone's `OriginStorage` rules assume claim paths.

## Pitfalls (ordered by blast radius)
1. **`*` is greedy across `/`**: never a wildcard in the host position except rules 1-2
   (`/_astro/`); an unanchored `/catalog/*` swallows `/apps/catalog/`. Keep `apply` refusing
   such patterns and ordering longest path first.
2. **Loop hazard**: a proxy rule whose target is `ocx.sh` loops the moment DNS moves. Lint for it.
3. **Proxy of path-shifted origins breaks assets** (index.ocx.sh, GH Pages): redirect instead.
4. **Unknown per-zone 404 and directory-index behaviour under `OriginStorage`**: decide from P1
   before designing rules for them.
5. **Silent API clamping** (`OriginRetryDelay` enum): read back every setting and every rule after
   apply; fail on diff.
6. **Stale HTML ~120 s** (shield + edge TTL): documented and accepted; a rename of a hashed asset
   never deletes the old one in CI, so stale HTML still works.
7. **Replication window**: asset is reachable before HTML lands, never after (ordering), so a
   reader cannot get new HTML pointing to a missing asset. Prune HTML last.
8. **Account key hygiene**: `BUNNY_API_KEY` is read only by owner-local tasks; do not write it to
   `.tmp/` logs; the apply script must redact the `AccessKey` header in errors.
9. **Reliability anecdotes**: recent incidents were regional/sync delays (status.bunny.net:
   "CDN Synchronization Delays" 2026-09-21, London Storage API 2026-08-18; a status-tracker
   aggregate, not a post-mortem), and one forum title alleges long-term file loss (page blocked
   403, unverified). The build is the source of truth, so a scheduled daily redeploy (design 3.1)
   heals any loss; keep it.

## Adoption signals
- Bunny has first-party Terraform (active, v0.19.x in Sept 2026), a CLI (young, 31 stars), an
  SDK family, and a Dec-2020 edge rules engine that gained Lua pattern matching in March 2026:
  the rule engine is actively developed.
- Community static-hosting tooling is thin and churning (bunny-deploy archived, ayeressian
  mid-popular), which supports owning the deploy code.
- HN (2026): users report Cloudflare Pages is still simpler for static deploys and praise Bunny
  cost. <https://news.ycombinator.com/item?id=48658268> (thin thread).

## Probe list for M0 (owner, scratch zones, no secrets in output)
P1a `OriginStorage` rule routes `/docs/*` to a second storage zone; response 200 with index.
P1b `/docs/`, `/docs`, `/docs/a/`, `/docs/a` behaviour (index mapping and slash handling).
P1c Missing path: which zone's error page is used; status code.
P1d Rule JSON shape from a dashboard-made `OriginStorage` rule (`ActionParameter1` semantics).
P2 `OriginUrl` with a bare pages.dev origin preserves the path; with a full URL plus
`%{Path.1-}` rewrites; Host reaching the origin.
P3 Redirect rule with `%{Path.1-}` and a query string.
P4 Seamless Domain Migration on a spare hostname; apex flattened CNAME on Cloudflare (DNS-only).
P5 `pagefind.js` content type and compression; `Content-Type` for `.pf_*` irrelevant.
P6 Pull zone with 10 hostnames and an uploaded wildcard certificate for previews.
