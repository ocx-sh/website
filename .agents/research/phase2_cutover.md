# Phase 2 cutover: moving `ocx.sh` from Cloudflare + hetzner1 nginx to Bunny

Researcher axis: cutover. Date: 2026-09-30. Scope: DNS, TLS, parallel run, redirects, rollback, SEO, verification.
Method: Bunny, Cloudflare, Google and GitHub docs; third-party migration write-ups; read-only `dig` and `curl` probes of the live `ocx.sh` zone (public queries only, no secrets). Items marked **[verify]** are inferences no source confirmed, each with a probe in "Open probes".

## Recommendation

1. **Keep the `ocx.sh` zone on Cloudflare. Flip only the apex record** from the proxied record to a DNS-only `CNAME ocx.sh -> <prod pull zone>.b-cdn.net` (Cloudflare flattens it), TTL 60 s. Do not move nameservers to Bunny DNS in this phase. Reasons the live zone forces this: the apex carries `MX` and `SPF TXT` records (mail), `index.ocx.sh`, `lore.ocx.sh`, `dev.ocx.sh` and the `index.ocx.sh` HTML-redirect rule live in the same zone, and `setup.ocx.sh` is already a DNS-only CNAME to Bunny, so the pattern has precedent on this zone.
2. **Issue the Bunny certificate before the flip, never after.** `ocx.sh` sends `strict-transport-security: max-age=31536000; includeSubDomains; preload`. Bunny's classic flow (point the CNAME, then press Verify & Activate SSL) leaves a window with a wrong certificate, which HSTS turns into a hard outage. Use Bunny's **Seamless Domain Migration** (TXT or HTTP validation, added 2026-04-28 and 2026-07-14 per the changelog): add hostname `ocx.sh` to the prod pull zone, validate via a TXT record in Cloudflare (no traffic change), get the certificate.
3. **Rehearse the real hostname before DNS moves.** With the certificate loaded, `curl --resolve ocx.sh:443:<Bunny IP> https://ocx.sh/...` runs the whole `cutover:verify` suite against production host matching (edge rules key on the literal host `ocx.sh`). The `*.b-cdn.net` dev hostname cannot prove that. **[verify]** that Bunny serves a pull-zone hostname whose DNS does not yet point at it (P-C1).
4. **Flip is one record, rollback is one record.** Export the Cloudflare zone (BIND) first. Rollback = delete the CNAME, re-create the saved proxied record(s). Keep Cloudflare Universal SSL enabled so the rollback path has a valid certificate. Flip only when the owner is at the keyboard, with the registry decision (next point) settled.
5. **Blocker to resolve before the flip: the OCI registry.** `https://ocx.sh/v2/` answers 401 (JFrog) today, through hetzner nginx. The 2026-09-30 sequence flips DNS with no mention of it. Either the registry is gone or moved first (design §2.8 step 8 already says "after the OCI registry is removed"), or Bunny edge rules proxy `/v2/` and `/artifactory/api/docker/...` to JFrog, which needs its own probe (large blobs, `Authorization` pass-through, no caching, Bunny bandwidth billing). Decide which, in writing, before scheduling the flip.
6. **Do not change URLs at the DNS flip.** While legacy sections are proxied (`/docs/` on Cloudflare Pages, `/catalog/` on `index.ocx.sh`, GitHub Pages sections), URLs stay byte-identical, so the flip is a hosting change with no SEO event. The real URL changes happen per section in phase 3 (see "Redirects and SEO").

## What the live zone looks like today (probed 2026-09-30, read-only)

| Fact | Observation | Consequence |
|---|---|---|
| Nameservers | `luciana.ns.cloudflare.com`, `guss.ns.cloudflare.com` | Full Cloudflare setup |
| Apex `A`/`AAAA` | Cloudflare anycast (`104.21.68.11`, `172.67.184.155`, `2606:4700:...`), TTL 300 | Proxied. Auto TTL is fixed at 300 s, so resolvers hold the old answer at most 5 min: no week-ahead TTL lowering needed |
| Apex `MX`, `TXT` | `MX 10 _dc-mx...`, `MX 50 mx2f8f.netcup.net`, `SPF` | A real CNAME cannot coexist with these. Cloudflare's apex flattening can. Moving the zone to Bunny DNS means re-creating mail records (avoidable risk) |
| `CAA`, `DS` | none | No CAA blocking Let's Encrypt. No DNSSEC, so no DS rollover risk in a later nameserver move |
| `setup.ocx.sh` | CNAME to `sh-ocx-setup.b-cdn.net` (A answer TTL 35 s) | Working precedent for DNS-only CNAME to Bunny from this zone |
| `index.ocx.sh`, `lore.ocx.sh`, `dev.ocx.sh` | proxied, same Cloudflare IPs | Untouched by an apex-only flip |
| `www.ocx.sh` | no record | Leave it |
| HSTS | `max-age=31536000; includeSubDomains; preload` | Certificate must be live before traffic. HTTP to HTTPS redirect must exist on Bunny (Force SSL) |
| `robots.txt` | only Cloudflare's managed "content signals" comment block, no `Allow`/`Disallow`, no `Sitemap:` line; same text on `ocx-website.pages.dev` | Injected by Cloudflare. It disappears once the apex is DNS-only, unless the root site ships its own |
| Sitemaps | `/sitemap.xml`, `/docs/sitemap.xml`, `/sitemap-index.xml` all 404 | There is no sitemap to snapshot (see design gap below) |
| URL shape | `/docs/getting-started` is 200; `/docs/getting-started/` and `.html` both 308 to the no-slash form. `/docs/` is 404. `/team` is 200 | VitePress clean URLs, no trailing slash. Starlight with `trailingSlash: 'always'` flips every docs URL at phase 3 |
| Canonical tags, meta robots on `/` | none found | Current site gives Google no canonical signal; 301s carry the weight |
| `/schemas/`, `/llms.txt` | 404 | Nothing to preserve there today |

## Sequence (owner-decided order, with gates)

| # | Step | Gate to proceed | Rollback |
|---|---|---|---|
| 0 | Inventory what else hetzner1 nginx serves for `ocx.sh` (HANDOVER open question; needs owner, this repo cannot read the host) | list agreed | n/a |
| 1 | Dev pull zone on `*.b-cdn.net`, `X-Robots-Tag: noindex` on every response, nothing indexed. Root site deployed | `cutover:verify` on the b-cdn host | delete zone |
| 2 | Prod storage zone(s) + pull zone `sh-ocx`, edge rules incl. legacy proxies (below). Still reached only via b-cdn host | `bunny:verify`, edge rule count well under 50 | delete zone |
| 3 | Add hostname `ocx.sh`, issue certificate by Seamless Domain Migration (TXT in Cloudflare). Enable Force SSL | certificate active; `curl --resolve` suite green on host `ocx.sh` | remove hostname |
| 4 | Soak on `--resolve` for a few days: lychee over old URLs, registry decision applied, legacy proxies checked for origin leaks | checklist below all green | fix |
| 5 | Audit Cloudflare rules scoped to `ocx.sh` (redirect, transform, cache, WAF, managed robots.txt, Always Use HTTPS). Each either has a Bunny equivalent or is knowingly dropped | list written into `infra/cutover/cloudflare.md` | n/a |
| 6 | Export Cloudflare zone. Flip apex: CNAME (DNS-only) to the pull zone, TTL 60 s | `cutover:verify --host ocx.sh` from the public internet; POP check below | restore saved record(s); TTL 60 s bounds it |
| 7 | Watch 48 h: Bunny logs, Search Console crawl stats, old nginx logs for residual traffic | zero hetzner1 hits for `ocx.sh` HTML | as step 6 |
| 8 | Raise TTL to 1 h after two stable weeks. Retire hetzner1 vhost and CF Pages only after zero traffic (Google: shut old hosting only after old-server logs show none) | logs clean | n/a |

## Decision: apex DNS options

| Option | Verdict | Why |
|---|---|---|
| **A. Cloudflare DNS, DNS-only flattened CNAME to `*.b-cdn.net`** | **Choose** | One record, no nameserver move, mail and other subdomains untouched, `index.ocx.sh` rule keeps working, rollback in seconds. Cost: Bunny's own apex docs prefer Bunny DNS (see geo risk) |
| B. Move the zone to Bunny DNS (Pull Zone record, auto wildcard certificate) | Defer | Bunny's documented recommended path for apex and gives a wildcard certificate, but it moves nameservers for every subdomain and the mail records, and the `index.ocx.sh` Cloudflare rule and CF Pages custom domain would need a new home. Larger blast radius than this phase needs |
| C. Redirect apex to `www` | Reject | Changes the canonical host for no reason |
| D. Keep Cloudflare proxied, repoint origin (today's nginx `location /` swap, design step 5) | Fallback | Lowest risk, keeps registry path split, but retains the hetzner1 hop and Cloudflare in the path. Use it if the registry blocks the flip and cannot wait |

**Geo-routing risk of A [verify].** Bunny documents that apex needs flattening, and warns that CNAME at the apex is not possible. A Cloudflare DNS-only flattened record publishes Bunny's A/AAAA answers as resolved from Cloudflare's side, so Bunny's DNS steering may pick the edge near Cloudflare, not the visitor. One forum reply says to avoid flattening with DNS-routed CDNs; one Bunny DNS review reports non-www routing "going off-country" before a Pull Zone record fixed it. No source measured this on Cloudflare + Bunny. Probe it (P-C3); if a region is consistently served from a distant POP, the answer is option B as a separate, later, rehearsed change, not a reason to stall phase 2.

## Redirects and SEO

- **Hosting change vs URL change.** Google treats a hosting change with unchanged URLs as a low-risk move: no Change of Address tool, lower TTL ahead of time, remove temporary `noindex`/`robots` blocks before the flip, keep both stacks until old logs go quiet, verify with URL Inspection, expect a temporary crawl-rate dip. The DNS flip is this kind of move. Keep it URL-neutral.
- **URL changes come later, per section.** When docs migrates (phase 3) every URL gains a trailing slash (`/docs/getting-started` becomes `/docs/getting-started/`), because Starlight runs `trailingSlash: 'always'`. That is a real site move with URL changes: permanent (301/308) redirects old to new, updated internal links, keep redirects "as long as possible, generally at least 1 year", submit a sitemap with the new URLs. Bunny edge rules must 301 no-slash to slash (and `.html` to slash) for the docs claim: **this redirect is not in the design today**. Also redirect `/team` (design rule 3 covers it).
- **Design gap: `infra/old-urls.txt` cannot come from `sitemap.xml`** as design §2.8 step 4 says, because no sitemap exists on `ocx.sh` or `ocx-website.pages.dev`. Seed it from the VitePress build output in `ocx-sh/ocx` (`website/` dist file list), the Search Console Performance "pages" export, and a crawl of the live site. Expect the no-slash form as the old URL.
- **New sitemap.** Nothing exists to preserve, so ship sitemaps with the root site and reference them from a real `robots.txt` (`Sitemap:` line; also re-add the content-signals text if the owner wants that policy statement kept, since Cloudflare stops injecting it once DNS-only **[verify]**). Starlight writes per-section sitemap indexes under the section base, so the root site needs a sitemap index that lists them **[verify per consumer when it migrates]**.
- **GitHub Pages sections.** Pages cannot send 301s. Use the planned stub: instant `meta refresh` (`content="0; url=..."`, which Google treats as permanent), `rel=canonical` to the new URL, and `location.replace` keeping the path as the last resort (Google: JavaScript redirects only when nothing else works). Keep stubs for at least a year. Before pointing a Bunny origin at `ocx-sh.github.io/<repo>/`, check that no org/user Pages custom domain is set: GitHub applies an org site's custom domain to all project sites, so the origin would 301 to `ocx.sh` and loop.
- **`index.ocx.sh`.** Stays a separate hostname on the same Cloudflare zone: JSON unchanged, HTML 301 to `ocx.sh/catalog/...`. Apex-only flip does not disturb it. This is a point for option A.
- **Search Console.** Use a Domain property (DNS TXT) so the hostname and protocol never matter; add before the flip to see crawl stats across the move.
- **Dev hostname leakage.** `*.b-cdn.net` stays reachable forever and the plugin's canonical tags point at `https://ocx.sh`. Keep an edge rule on the b-cdn hostname (`X-Robots-Tag: noindex`, cheap; a 301 would break `--resolve`-free dev testing). One rule in the 50-rule budget.

## Legacy proxies behind Bunny (during and after cutover)

Bunny "Change Origin URL" edge rules route `/docs/`, `/catalog/`, and each GitHub Pages section to today's hosts.

- **Host and SNI.** Bunny has no SNI override: the origin receives SNI and (with Forward Host Header off) Host equal to the origin hostname. That fits `*.pages.dev` and `*.github.io` (they serve by their own hostname). It fails for any origin that requires the visitor's host. One third-party project had to pass the public host in a custom request header for this reason.
- **Origin leaks [verify].** A legacy origin that emits an absolute `Location` or absolute URLs containing `pages.dev` or `github.io` leaks the origin host to users. Add a verify assertion: no response header or HTML contains `pages.dev` or `github.io` for proxied paths.
- **Edge-rule budget.** Hard limits: 50 rules per pull zone, 5 triggers per rule, 5 conditions per trigger. The design budgets 40. Legacy proxies, registry rules (2, if registry stays), the b-cdn noindex rule, and the slash redirects all add to that; count them in `rules.mjs` and delete each legacy rule as its section migrates.
- **Caching.** Proxied HTML inherits the zone's 60 s edge TTL and `no-cache` browser rule. Registry paths need cache bypass.

## Pitfalls

1. Orange-cloud (proxied) on a record pointing at Bunny: double CDN, and Bunny's certificate validation fails. The apex record must be gray (DNS-only).
2. Cert after flip with HSTS preload: a few minutes of unreachable site for returning visitors. Mitigated by step 3.
3. Losing Cloudflare features silently when the apex goes DNS-only: WAF, Always Use HTTPS, redirect and transform rules scoped to `ocx.sh`, managed `robots.txt`. Step 5 lists them first.
4. Cloudflare "flatten all CNAMEs" breaks third-party CNAME-based domain verification; keep the apex record flattened by the default apex rule only.
5. Mail: never touch apex `MX`/`TXT`. Cloudflare keeps them when the apex A/AAAA become a flattened CNAME.
6. Redirect loops through Bunny when a legacy origin redirects back to `ocx.sh` (GitHub Pages custom domain, CF Pages custom domain, nginx).
7. Registry traffic through a cache: `/v2/` and token realm must never be cached, and multi-GB blob bandwidth lands on Bunny's bill, the reason for Bunny in the first place.
8. Rolling back after the TTL is raised: keep TTL 60 s until stable, not longer.
9. `dev.ocx.sh` currently resolves through Cloudflare + hetzner nginx (design step 2). The owner changed staging to the b-cdn hostname; delete the nginx-staging step and `infra/cutover/dev.nginx.conf` from WP7 scope so the plan matches.

## Verification checklist (extend `cutover:verify`, C-054)

Run first with `--resolve ocx.sh:443:<IP>`, again after the flip from the public internet.

- TLS: certificate issuer is Let's Encrypt via Bunny, valid for `ocx.sh`, SAN matches; `http://ocx.sh/` 301s to HTTPS in one hop.
- Every URL in `infra/old-urls.txt` returns 200 or one 301 to a 200 (no chains, no loops).
- Legacy proxied paths: 200, correct content marker, no `pages.dev`/`github.io` in headers or body, no `X-Robots-Tag: noindex`.
- New canonicals: every page carries a canonical `https://ocx.sh/...` with trailing slash; 404 page is the site's own.
- `robots.txt` has no `Disallow: /` and a `Sitemap:` line; sitemap URLs return 200.
- Dev hostname: `X-Robots-Tag: noindex` present; prod hostname: absent.
- Registry (if still behind `ocx.sh`): `/v2/` 401 with `WWW-Authenticate`; token fetch 200; `docker pull` of a real multi-hundred-MB image and `ocx install` succeed; `index.ocx.sh/config.json` unchanged (C-043).
- `dig ocx.sh` from several public resolvers: CNAME-flattened answer, TTL 60; `MX` and `TXT` still present.
- POP check: request from at least three regions (Bunny's `server` header names the serving POP **[verify]**) and compare with expected region.
- Cache: HTML 60 s edge TTL and `no-cache`; `_astro/` immutable; `pagefind.js` `no-cache`.
- Search Console: URL Inspection live test on `/`, a docs page, a legacy-proxied page; crawl stats stable at +48 h.

## Open probes (owner-local, before the flip)

| Id | Question | Pass |
|---|---|---|
| P-C1 | Does a Bunny pull zone accept and serve hostname `ocx.sh` (certificate via Seamless Domain Migration) while DNS still points at Cloudflare? | `curl --resolve` returns the Bunny-served page over a valid certificate |
| P-C2 | Does Cloudflare accept an apex CNAME alongside the existing `MX` and `TXT` without touching mail? | `dig MX/TXT` unchanged on a scratch subdomain test first (no apex change needed to learn this: Cloudflare documents apex flattening by default) |
| P-C3 | Does the flattened answer steer the visitor to a near POP? | three-region POP check at Section "Verification" matches region |
| P-C4 | Registry via Bunny (only if the registry stays): large blob pull, token realm, no cache | `docker pull` and `ocx install` succeed on the dev hostname |
| P-C5 | Does any legacy origin emit absolute origin URLs or redirect back to `ocx.sh`? | verify suite clean |

## Evidence

Bunny
- Custom hostname, apex, external DNS, Cloudflare proxy warning: https://bunny.net/docs/cdn/custom-hostname
- SSL, Let's Encrypt, wildcard with Bunny DNS, CAA note, apex options, Seamless Domain Migration mention: https://bunny.net/docs/cdn/ssl-setup
- Changelog, Seamless Domain Migration 2026-04-28 (DNS TXT) and 2026-07-14 (HTTP validation added): https://bunny.net/docs/changelog
- DNS records: CNAME flattening on CNAME and Pull Zone records at the apex: https://bunny.net/docs/dns/records
- Load Free Certificate API (`useOnlyHttp01`, DNS01 needs a Bunny DNS zone, wildcard is DNS01 only): https://bunny.net/docs/api-reference/core/pull-zone/load-free-certificate
- Request External DNS Certificate API (returns TXT record details): https://www.withone.ai/knowledge/bunny-net/conn_mod_def::GKys_YEZfVA::vLSPTLggQIyQnOaz-R1esg (third-party API catalogue, cross-check in the dashboard)
- Edge rules actions (Change Origin URL, Set Request/Response Header, Redirect, Override Cache Time): https://bunny.net/docs/cdn/edge-rules
- Limits, 50 rules per pull zone, 5 triggers per rule, 5 conditions per trigger: https://docs.bunny.net/cdn/limits (as quoted in search results)
- Direct-IP origin with Host header, Forward Host Header caveat: https://bunny.net/docs/cdn/edge-rules/ip-origin
- No SNI override, public-host header workaround: https://github.com/norgai/norg-edge-mirror-cloudflare-deploy/pull/18

Cloudflare
- CNAME flattening enabled by default at the apex, DNS-only vs proxied behaviour, limits: https://developers.cloudflare.com/dns/cname-flattening/set-up-cname-flattening
- TTL: 60 s minimum (non-Enterprise), proxied Auto TTL fixed at 300 s: https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/
- Full vs partial setup, apex needs flattening support: https://developers.cloudflare.com/dns/zone-setups/partial-setup/

Google
- Hosting migration without URL changes (TTL, remove crawl blocks, monitor both stacks, decommission after logs): https://developers.google.com/search/docs/crawling-indexing/site-move-no-url-changes
- Site move with URL changes (301/308, keep at least 1 year, new sitemap, no Change of Address tool within a domain): https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
- Redirect types (instant meta refresh treated as permanent; JavaScript last resort): https://developers.google.com/search/docs/crawling-indexing/301-redirects

GitHub
- Custom domain on an org/user site applies to its project sites: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages

## Adoption signals

- **This zone already does it:** `setup.ocx.sh` is a DNS-only CNAME to Bunny, live today.
- Migrators from Cloudflare to Bunny report low-drama moves and prefer doing CDN first and DNS provider second, the same split this plan uses: https://dbushell.com/2025/04/27/bunny-cdn-edge-storage/, https://jola.dev/posts/dropping-cloudflare, https://jonathan-frere.com/posts/switching-to-bunny-cdn/.
- Bunny shipped Seamless Domain Migration in April 2026 and extended it in July 2026, which is a first-party signal that zero-downtime certificate-before-DNS is the supported path.
- Counter-signal: a Hacker News reply advises against flattening with DNS-routed CDNs and recommends Bunny's own nameservers for apex domains (https://news.ycombinator.com/item?id=46871027; detail not given in the thread). This is the reason for P-C3 and for keeping option B as a later step.
- Not found: any published report of Cloudflare DNS-only apex flattening to a Bunny pull zone at scale, in either direction. Treat geo behaviour as unmeasured.

## Changes this implies for the plan and design (for the synthesiser)

- Design §2.8: replace step 2 (nginx staging of `dev.ocx.sh`) with the b-cdn dev zone; make step 8 the Seamless-migration flow above (certificate before DNS); add the Cloudflare rules audit and the export-before-flip step.
- WP7: drop `infra/cutover/dev.nginx.conf`; `infra/cutover/nginx.conf` only if option D is ever used; add the no-slash to slash redirect, b-cdn noindex rule, legacy-origin rules and Force SSL to the edge-rule budget (recount against 50); reseed `infra/old-urls.txt` without a sitemap; add verify assertions (origin-leak, POP, `--resolve` mode, dev/prod `X-Robots-Tag`).
- WP8: ship `robots.txt` with a `Sitemap:` line and a sitemap index.
