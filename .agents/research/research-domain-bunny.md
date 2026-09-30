# Research: domain (Bunny CDN hosting + OCI registry coexistence)

Read first: `HANDOVER.md` § CI and Bunny, `.agents/research/discover-bunny-lore.md`,
`www-setup/deploy/bunny/README.md` + `edge-rules.py`. All current-docs claims below
were fetched 2026-09-27 from `docs.bunny.net`/`bunny.net/docs` (Mintlify, no visible
per-page dates — flagged where a cited source is a dated blog/forum post instead).

## Direct answers

**1. Edge Storage API.** List (`GET` on a directory path) returns a JSON array,
non-recursive (one level; recurse client-side per subdirectory) with no documented
pagination — fine at ocx.sh's per-section scale. Delete is `DELETE`; deleting a
directory recursively removes its contents; deleting the zone root is blocked
unless `allowRootDelete=true`. `Checksum` header is SHA256 **hex, uppercase**,
optional per-PUT. No documented per-key rate limit for the classic HTTP API (the
newer S3-compatible mode caps at 500 RPS combined / 1 Gbps — use that as a proxy
ceiling); parallel PUTs are the normal pattern (www-setup's `bunny.sh` does
sequential PUT+retry, headroom to parallelize). Geo-replication has **no
completion API** (confirmed — matches `HANDOVER.md`'s "no completion API"), so
"upload assets → upload HTML → prune stale → purge" is correct precisely because
purge is separate from replication: purge tells edge nodes to drop cache, it does
not wait for storage replication, so a transient stale HTML/asset mismatch during
lag is possible under either ordering — accept it, it self-heals within seconds.

**2. Edge rules.** **The 20-rule budget in `HANDOVER.md`/`www-setup/README.md` is
stale.** Current default is **50 edge rules per zone, 5 triggers per rule, 5
conditions per trigger** — all raisable on request. Directory index: Bunny does
**not** auto-map `/docs/` → `/docs/index.html` the way S3/Nginx `autoindex` does;
that mapping is storage-zone-level **Error Handling** (404 File Path +
"Rewrite 404 to 200"), and it is **global to the storage zone**, not per path —
exactly the limitation `HANDOVER.md` already flags for `bunnycdn_errors/404.html`.
There is no native per-path-prefix 404/SPA-fallback primitive in Edge Rules
directly; `%{Path.N}` variable expansion (confirmed syntax, works in Change
Origin URL / Redirect / Set Header actions) gets you routing, not fallback-on-404.
Trailing-slash root paths need an explicit trailing `/` in the trigger pattern
(`https://host/docs` never matches root, `https://host/docs/` does).

**3. Registry coexistence.** Two real options, both viable:
- **Edge Rule "Change Origin URL"** on trigger `*/v2/*` (and `/v1/*` if used) →
  `https://sh-ocx-oci-prod.<jfrog-host>/%{Path.1-}`, paired with a **Set Request
  Header: Host** rule (same pattern used in Bunny's own "Direct IP Origin" guide).
  Origin-layer rules run only on cache MISS/BYPASS; `Authorization` /
  `WWW-Authenticate` are ordinary headers Bunny does not strip, so token auth to
  JFrog should pass through unmodified. Docker/OCI clients tolerate a `307`
  blob-redirect from a registry (that's how most registries hand off to blob
  storage today) but an edge-rule origin swap isn't a redirect at all from the
  client's perspective — the client still talks to `ocx.sh`, Bunny fetches from
  JFrog behind the scenes, so there is no client-visible redirect/auth-realm
  concern. Cache manifests-by-tag are mutable (`latest`, floating `vN`) — add an
  Override-Cache-Time=0 (or short) rule scoped to `*/v2/*/manifests/*` with a tag
  reference, vs. long/immutable for digest-addressed blobs.
- **Edge Scripting middleware** (`onOriginRequest`, still **Preview**): can
  `fetch()` an arbitrary backend and return that `Response` directly, giving full
  programmatic control (retry, custom auth shaping) — but it's a preview feature
  and adds a Deno/V8 hop; use only if the plain edge rule proves insufficient.
- **Recommendation: plain edge rule, not scripting.** Lower risk (GA, not
  preview), directly matches the pattern Bunny documents for origin overrides,
  and keeps the registry path off an execution runtime that has no published
  size/timeout limits. **Risk to flag**: no large-blob streaming numbers are
  published for either path — pilot with the largest known ocx package blob
  before cutover, and keep a rollback (apex stays on hetzner1 nginx proxying
  `/` to Bunny, `/v2` unchanged) ready as the fallback if blob streaming or
  auth-realm behavior misbehaves in practice.

**4. Preview environments.** No Bunny "environments" feature exists in the docs
found. Practical pattern: second **Pull Zone** on `preview.ocx.sh` pointed at the
**same Storage Zone**, with per-PR paths (`/pr-123/...`) and an edge rule
rewriting `preview.ocx.sh/*` → `storage/preview/%{Path.0-}`. Cost is bandwidth-only
(Bunny pricing has no per-zone base fee); cleanup is a scheduled job calling
`DELETE` on `preview/pr-<n>/` after PR close — same Storage API already in the
deploy action.

**5. Security.** No evidence of Bunny OIDC/workload-identity support anywhere in
the docs or API reference — GitHub Actions must keep using static secrets
(`BUNNY_STORAGE_KEY` per environment, as `www-setup` already does). Storage zones
do support a **separate read-only password** (confirmed in the S3 doc) — useful
for any consumer that only needs to read, never for CI writers. For **write**
least-privilege across many repos deploying into one Storage Zone: one write key
= any repo's CI can overwrite any other section, as `HANDOVER.md` already flags.
Two mitigations, in order of soundness:
  - **One Storage Zone per section**, each with its own password, fronted by
    **one Pull Zone** using the `OriginStorage` edge-rule action (confirmed to
    exist as action enum 17 in the Edge-Rules-Ordering reference, though not
    documented in the main action table — verify behavior with `plan`/a live
    test before relying on it) to bind a path prefix to a specific Storage Zone
    as origin. This gives per-repo write isolation without per-section
    subdomains.
  - Fallback if `OriginStorage` doesn't behave as hoped: keep the single
    Storage Zone but scope each repo's CI key to a **path-prefix write check
    enforced in the deploy action itself** (the action refuses to PUT/DELETE
    outside its declared `section` input) — weaker (still a shared secret) but
    zero new Bunny surface area.

**6. Redirects at scale.** Confirmed: `{{path}}`/`%{...}` variable expansion
supports `https://www.example.com{{path}}`-style 301s with wildcard triggers —
covers `index.ocx.sh`, `dev.ocx.sh` cleanly (hostnames Bunny will own). GitHub
Pages URLs (`ocx-sh.github.io/...`) are **not ocx.sh's problem to redirect** —
Bunny/hetzner1 has no authority over `github.io`; each old Pages site must ship
its own redirect-only build (a static `index.html` with `<meta http-equiv=
"refresh">` or a tiny redirect action), as `discover-bunny-lore.md` already notes.

## Key findings

- Edge rule budget is 50/zone, not 20 — [CDN Limits and Defaults](https://bunny.net/docs/cdn/limits)
- Directory listing/delete/checksum semantics — [Storage HTTP API](https://bunny.net/docs/storage/http)
- `%{Path.N}` / `{{path}}` variable expansion — [Dynamic Variables](https://bunny.net/docs/cdn/edge-rules/dynamic-variables), [Variable Expansion](https://bunny.net/docs/cdn/edge-rules/variable-expansion)
- Rule ordering, cache-vs-origin execution layers, full action enum incl. `OriginStorage`(17) — [Edge Rules Ordering](https://bunny.net/docs/cdn/edge-rules/ordering)
- Trigger path wildcard semantics, root-path trailing slash gotcha — [Trigger Path Setup](https://bunny.net/docs/cdn/edge-rules/trigger-path)
- Origin override via edge rule (`Change Origin URL` + `Set Request Header: Host`) — [Direct IP Origin](https://bunny.net/docs/cdn/edge-rules/ip-origin)
- Purge by exact URL / prefix / `CDN-Tag`, rate limits (~300/min exact, ~30/min prefix) — [Purge Cache](https://bunny.net/docs/cdn/purge-cache)
- Storage-zone-level (global) 404→200 SPA fallback, not per-path — [Deploy a Vite Site](https://bunny.net/docs/storage/static-site-hosting/vite), [Frontend Deployment Guides](https://bunny.net/docs/storage/static-site-hosting)
- Edge Scripting middleware `onOriginRequest`/`onOriginResponse`, **Preview** status — [Middleware scripts](https://bunny.net/docs/scripting/middleware/overview)
- S3-compatible API, read-only password, no OIDC evidence — [S3](https://bunny.net/docs/storage/s3)
- No native per-section 404 primitive; existing OCX write-up already correctly names this gap — internal: `HANDOVER.md`, `.agents/research/discover-bunny-lore.md`

## Sources

- [CDN Limits and Defaults](https://bunny.net/docs/cdn/limits)
- [Storage API Reference](https://bunny.net/docs/reference/storage-api) / [Storage HTTP](https://bunny.net/docs/storage/http)
- [Edge Rules](https://bunny.net/docs/cdn/edge-rules)
- [Dynamic Variables](https://bunny.net/docs/cdn/edge-rules/dynamic-variables)
- [Variable Expansion](https://bunny.net/docs/cdn/edge-rules/variable-expansion)
- [Edge Rules Ordering](https://bunny.net/docs/cdn/edge-rules/ordering)
- [Trigger Path Setup](https://bunny.net/docs/cdn/edge-rules/trigger-path)
- [Direct IP Origin with Custom Hostname](https://bunny.net/docs/cdn/edge-rules/ip-origin)
- [Purge Cache](https://bunny.net/docs/cdn/purge-cache)
- [Bunny Storage overview](https://bunny.net/docs/edge-storage-overview)
- [S3-compatible API](https://bunny.net/docs/storage/s3)
- [Middleware scripts](https://bunny.net/docs/scripting/middleware/overview)
- [Frontend Deployment Guides](https://bunny.net/docs/storage/static-site-hosting) / [Deploy a Vite Site](https://bunny.net/docs/storage/static-site-hosting/vite)
- Flagged as possibly >18 months / unverified currency: [Ghost forum thread on Edge Rules limits](https://forum.ghost.org/t/is-there-a-limit-to-edge-rules-on-bunny-net-pull-zones/56881) (superseded by the current `/docs/cdn/limits` figure of 50 above)

## Recommendation

**Keep the apex on Bunny; route `/v2/*` to JFrog via a plain Edge Rule, not
Edge Scripting.** It's GA, matches Bunny's own documented origin-override
pattern, and avoids depending on a Preview-tier runtime for a supply-chain-
critical path (package pulls). Pilot the largest real blob through it before the
DNS cutover; keep hetzner1 nginx as the rollback path.

**Zone layout:**

| Zone | Purpose |
|---|---|
| 1 Pull Zone (`ocx.sh`) | single public edge, all sections + `/v2` |
| 1 Storage Zone per section (`sh-ocx-web-root`, `sh-ocx-docs`, `sh-ocx-catalog`, `sh-ocx-integrations`, `sh-ocx-apps`, `sh-ocx-install`) | write isolation per deploying repo; bound to the pull zone per-path via `OriginStorage` edge rules (verify the action live before committing to it — fall back to a single shared zone + deploy-action path guard otherwise) |
| 1 preview Pull Zone (`preview.ocx.sh`) | same storage, `preview/<pr>/` prefix, cleaned up on PR close |

**Edge-rule budget (of 50, not 20 — verify with `plan` against the real
zone before finalizing counts):**

| # | Rule | Notes |
|---|---|---|
| 1 | `/v2/*`, `/v1/*` → Change Origin URL → JFrog | + paired Set-Header:Host rule (2 rules total) |
| 3 | Manifest-by-tag → short/no cache | scoped pattern, avoid caching floating tags |
| 4-9 | `OriginStorage` (or Change-Origin-URL fallback) per section prefix | one per section (6) |
| 10 | `index.ocx.sh` → `ocx.sh/catalog{{path}}` redirect | 301, variable expansion |
| 11 | `dev.ocx.sh` → preview pull zone or its own path | per open question in `HANDOVER.md` |
| 12-13 | Storage-zone-level 404 fallback per section, where a real per-path primitive is missing | accept the global-fallback limitation for non-SPA sections (Starlight/VitePress emit real HTML per route, so only truly SPA-shaped sections need this) |

~13 of 50 used — large headroom versus the 20-rule ceiling the current docs
assumed, so budget pressure is not the blocker it looked like; the open risk is
`/v2` streaming/auth behavior under load, not rule count.
