# Research: patterns

Researcher axis: design patterns / ecosystem. Context: HANDOVER.md decisions +
2026-09-27 planning context. All dates checked against 2026-09-27; ages flagged.

## Direct answer (per topic)

**1. Distribution.** Ship one npm package, not many — GOV.UK Frontend moved
*from* per-component packages to a single `govuk-frontend` package specifically
because lockstep versioning across many packages caused CSS duplication and
broken behavior on partial upgrades
([proposal 002](https://github.com/alphagov/govuk-design-system-architecture/blob/main/proposals/002-publish-one-npm-package-instead-of-multiple-npm-packages.md)).
`@ocx-sh/theme` as one package with subpath exports matches this. Token
format: DTCG (W3C, stable v2025.10, Oct 2025) is the emerging interchange
format when tokens cross Figma/multiple build targets
([designtokens.org](https://www.designtokens.org/tr/third-editors-draft/format/)),
but plain `--ocx-*` CSS custom properties (your current approach, matching
`grimoire-indexer`) is correct when the only consumers are CSS-based generators
(Astro/Starlight/VitePress) — DTCG earns its cost only once a non-CSS platform
(native app, design-tool round-trip) enters the picture. Propagation:
Dependabot + grouped PRs is standard but **groups and auto-merge are mutually
exclusive today** — a `groups:` block disables auto-merge eligibility for
grouped PRs
([Tomoda Hinata guide](https://tomodahinata.com/en/blog/dependabot-yml-configuration-complete-guide)),
so ocx's single-package model sidesteps the conflict (nothing to group). Nav
registry as a package field, not a runtime fetch, is the dominant industry
choice for anything that gates layout (see Vercel below) — HANDOVER.md's
"nav.json ships inside the library" call is correct and the draft's rejected
"fetch nav.json from ocx.sh/theme/v1 at CI time" alternative is the pattern
these sources warn against (adds a runtime dependency and a lockstep-timing
failure mode).

**2. Path-mounted multi-repo sites.** Vercel's Microfrontends product
(`microfrontends.json`, [routing docs](https://vercel.com/docs/microfrontends/routing))
is the most directly transferable prior art: paths are declared per-app in a
single router config living in the "default" app, path expressions support
prefix wildcards, and — the load-bearing detail for ocx — **independent repos
are explicitly not deployed in lockstep**: "Changes to separate microfrontends
are not rolled out in lockstep... make sure the new application can handle the
requests before merging." Vercel also solves asset collision across
independently-built apps with a mandatory per-app `assetPrefix`, and gives
every commit/branch a stable, time-frozen preview URL by resolving routing at
request time rather than baking it into a build. Cloudflare and HashiCorp both
run their unified docs as a **single content repo with per-product
directories** rather than n build-time-merged repos — HashiCorp's
`web-unified-docs` explicitly frames this as solving the coordination cost ocx
is trying to solve differently ("storing documentation in one branch of one
repo dramatically simplifies contributing," [hashicorp/web-unified-docs](https://github.com/hashicorp/web-unified-docs)) —
i.e., HashiCorp centralizes content, ocx centralizes only chrome/deploy while
keeping content in each product's repo. That's a real fork in the road worth
naming, not just adopting.

**3. Reusable deploy action.** `workflow_call` reusable workflows, not
composite actions, is the right shape once secrets/environments/approval gates
are involved — composite actions cannot hold `secrets:`, environment
protection rules, or multi-job fan-out
([Tenki Cloud comparison](https://tenki.cloud/blog/reusable-workflows-vs-composite-actions)).
ocx's deploy has exactly this shape (org Bunny secrets, per-section
environment). OIDC over long-lived secrets is unambiguous 2026 consensus
(short-lived, non-exfiltratable, no rotation burden —
[nhimg.org](https://nhimg.org/articles/github-actions-secret-sprawl-and-oidc-shift-the-trust-model/)),
but Bunny has no OIDC federation today, so this only applies if ocx fronts
Bunny credential issuance with its own broker later — not a phase-2 blocker.
SHA-pin every third-party action, never trust a floating major tag: the
tj-actions/changed-files compromise (Mar 2025) moved 350+ tags to a
secret-dumping commit across 23,000+ repos
([Orbis writeup](https://orbisappsec.com/blog/how-github-actions-mutable-action-tags-enable-supply-chain-attacks));
this applies doubly to `ayeressian/bunnycdn-storage-deploy` and
`R-J-dev/bunny-deploy` if either is used instead of a from-scratch script —
neither has enough independent security scrutiny to trust at a floating tag.
Asset-first-then-HTML-then-prune (HANDOVER.md's existing decision) is the
well-established S3/CDN static-site pattern precisely because
`sync --delete` deletes before uploading and can leave HTML referencing gone
assets if run in the wrong order or as one pass
([aws-cli#1417 discussion](https://github.com/aws/aws-cli/issues/1417)).

**4. AI-agent design system docs.** This axis moved fast and recently: Google
Labs shipped `DESIGN.md` in April 2026 — a markdown+YAML-frontmatter spec for
visual identity with a CLI (`npx @google/design.md lint|diff|export|spec`) that
lints tokens, checks WCAG contrast, and diffs token-level regressions between
versions ([google-labs-code/design.md](https://github.com/google-labs-code/design.md),
[coverage](https://themenonlab.blog/blog/google-design-md-ai-agents-design-systems)).
It's 5 months old, not yet a de facto standard, but it's the first
purpose-built, lintable format in this space and worth tracking or adopting
outright rather than inventing an equivalent bespoke rule format. The
mechanism argument from Builder.io is the one to internalize: "documents are
suggestions; tokens are types... the fix is to make design tokens the only
importable source of design values, enforce with lint rules and types, turn
the design system into a contract that fails the build"
([builder.io](https://www.builder.io/blog/how-to-make-ai-agents-follow-your-design-system)).
A prose rule ("coral is the only interactive colour") is necessary but not
sufficient — pair it with a lint check (literal-hex-value scan, which
`css-theming`'s `gate.md` already plans) rather than relying on the agent
reading and retaining prose every session. `AGENTS.md` is the settled sibling
format for build/test/convention context (Linux Foundation as of Dec 2025,
OpenAI/Google/Sourcegraph/Cursor/Factory joint origin) — ocx's `ocx-site-integration`
skill is filling the same niche `AGENTS.md` fills for conventions generally,
scoped to design+deploy; no conflict, but consider whether the lore skill
should also emit a project `AGENTS.md` stub referencing it, since agents now
check for that file by convention before anything else.

**5. Naming schema.** No single canonical spec exists for path registries the
way DTCG exists for tokens — this is genuinely underspecified across the
industry and ocx is choosing, not discovering, most of this. Two real
conventions to align with: (a) subdomain-per-branch/PR previews
(`pr-123.preview.example.com`, `<branch>.<project>.pages.dev`) is what
Cloudflare Pages, Vercel, and Netlify all default to, over path-based preview
schemes — isolation, cookie/storage separation, and CSP simplicity are the
reasons, and a wildcard cert avoids Let's Encrypt's ~50-certs/week/domain
ceiling; (b) versioned docs paths (`/docs/v1/`) beat versioned subdomains for
a single coherent product doc set — shared search/analytics/cross-version
linking is the reason cited, matching the `/integrations/python/` model
already chosen. Neither maps cleanly onto ocx's mega-menu ecosystem
hub-of-many-repos shape, so the registry schema itself (reserved paths, repo→path
1:1, `nav.json` shape) is ocx's own design surface, not an import.

## Trends

- DTCG format crossed from spec to real adoption in the last 12 months (56%→84%
  of teams per zeroheight survey cited in the DTCG search) — still young but
  no longer speculative; watch for a `@ocx-sh/theme` v2 need if a non-web
  consumer ever appears.
- "Design system as compiler, not documentation" is the dominant 2026 framing
  for AI-agent design adherence — tokens + lint + build failure over prose
  instructions. ocx's `css-theming` rule (cascade gate scripts, deny-list) is
  already aligned with this; the `ocx-design` rule under construction should
  be graded against DESIGN.md's shape, not invented independently.
- OIDC-over-secrets is now baseline hygiene guidance, not a frontier practice.
- SHA-pinning third-party Actions is now enforceable at the org policy level
  (GitHub shipped blocking/pinning policy support Aug 2025), making it cheap
  to require rather than merely recommend.

## Key findings (each with a link)

- GOV.UK Frontend's single-package pivot and why:
  [proposal 002](https://github.com/alphagov/govuk-design-system-architecture/blob/main/proposals/002-publish-one-npm-package-instead-of-multiple-npm-packages.md)
- Dependabot groups disable auto-merge eligibility:
  [dependabot.yml guide](https://tomodahinata.com/en/blog/dependabot-yml-configuration-complete-guide)
- DTCG format module, stable Oct 2025:
  [designtokens.org](https://www.designtokens.org/tr/third-editors-draft/format/)
- Vercel microfrontends: explicit no-lockstep guarantee + `assetPrefix`
  collision handling:
  [vercel.com/docs/microfrontends/routing](https://vercel.com/docs/microfrontends/routing)
- HashiCorp centralizes docs *content* into one repo rather than merging
  builds from many:
  [hashicorp/web-unified-docs](https://github.com/hashicorp/web-unified-docs)
- Reusable workflows vs composite actions, when secrets/environments require
  the former:
  [tenki.cloud](https://tenki.cloud/blog/reusable-workflows-vs-composite-actions)
- tj-actions/changed-files tag-hijack compromise, 23,000+ repos, why SHA
  pinning matters:
  [orbisappsec.com](https://orbisappsec.com/blog/how-github-actions-mutable-action-tags-enable-supply-chain-attacks)
- `aws s3 sync --delete` ordering hazard (assets before HTML before delete):
  [aws-cli#1417](https://github.com/aws/aws-cli/issues/1417)
- Google `DESIGN.md` spec + CLI (Apr 2026, **<6 months old**):
  [google-labs-code/design.md](https://github.com/google-labs-code/design.md)
- "Tokens are types, not suggestions" — why prose-only rules decay:
  [builder.io](https://www.builder.io/blog/how-to-make-ai-agents-follow-your-design-system)
- AGENTS.md provenance and scope (Linux Foundation, Dec 2025):
  [dev.to AGENTS.md/SKILL.md/DESIGN.md layering](https://dev.to/aws-builders/agentsmd-skillmd-designmd-how-ai-instructions-split-into-three-layers-d0g)
- Preview subdomain convention + wildcard-cert fix for Let's Encrypt rate
  limits:
  [bex.co preview environments](https://bex.co/blog/2026/09/09/preview-environments-per-pull-request)
- Path-prefix versioning beats subdomain for coherent single-product docs:
  search synthesis, no single authoritative source — treat as
  **unverified: pattern consensus, not a citable spec**.
- `ayeressian/bunnycdn-storage-deploy` and `R-J-dev/bunny-deploy`: both exist,
  low visible independent security scrutiny, neither audited here beyond
  README-level: [ayeressian repo](https://github.com/ayeressian/bunnycdn-storage-deploy),
  [R-J-dev repo](https://github.com/R-J-dev/bunny-deploy) — **flag: not deeply
  vetted, treat evaluation as still open**.

## Sources

GOV.UK Frontend architecture proposals · Style Dictionary / Carbon / Primer
Primitives repos · designtokens.org (W3C DTCG) · Vercel Microfrontends docs ·
HashiCorp web-unified-docs & dev-portal repos · Cloudflare Pages monorepo docs
· tenki.cloud, nhimg.org, orbisappsec.com, stepsecurity.io (Actions security) ·
aws-cli GitHub issues · google-labs-code/design.md + coverage (themenonlab,
dev.to) · builder.io · shadcn/ui changelog & DESIGN.md coverage · bex.co,
deploywise.dev (preview environments) · ayeressian/R-J-dev Bunny action repos.

## Recommendation (opinionated, per topic)

1. **Keep one package, plain CSS vars.** Don't adopt DTCG now — it's a real
   spec but solves a cross-platform problem ocx doesn't have yet (everything
   is CSS-target). Revisit only if a native-app or non-CSS consumer appears.
   Ship `nav.json` inside the package, not fetched at build time — the draft's
   rejected fetch alternative is the anti-pattern the Dependabot-groups and
   Vercel no-lockstep sources both independently argue against.
2. **Don't try to match Vercel's atomic microfrontends routing on Bunny** —
   Bunny has no request-time app-aware router. Explicitly design for the
   no-lockstep case Vercel calls out: each consumer repo deploys on its own
   schedule, and the shared header/nav must degrade gracefully when one
   section is on an older `@ocx-sh/theme` than another (already implied by
   "nav change is a library release," but make the graceful-degradation case a
   named test, not an assumption).
3. **Reusable `workflow_call`, SHA-pin everything, skip OIDC for now.** Build
   the deploy action as a reusable workflow (not composite) because it holds
   org secrets and needs environment gating. Do not adopt `ayeressian/*` or
   `R-J-dev/*` as-is without pinning to an audited SHA and reading their full
   source — prefer writing the ~150 lines against `www-setup/scripts/lib/bunny.sh`
   directly, since that's already trusted and avoids a third dependency to
   secure. OIDC is a later phase-2+ item, not now (no Bunny federation to hang
   it off).
4. **Treat `DESIGN.md` as the reference shape for the `ocx-design` rule, don't
   reinvent the format.** Even if ocx doesn't literally adopt Google's CLI,
   structure the rule the way DESIGN.md does: token table + do/don't pairs +
   forbidden-value list + a lint command that fails the build, not prose that
   an agent reads once per session. This is a stronger and more current
   pattern than anything bespoke would be.
5. **Naming schema is ocx's to invent — anchor only two pieces to convention:**
   preview hostnames as `pr-<n>.preview.ocx.sh` (subdomain, not path — matches
   universal preview-environment practice and avoids `/preview/` colliding
   with a future real section), and versioned SDK docs as path-prefixed
   (`/integrations/python/v1/`) rather than subdomained, consistent with the
   catalog's existing shape. Everything else (section ids, repo→path mapping,
   reserved paths) has no external precedent worth importing — design it
   directly against the consumer table in HANDOVER.md.
