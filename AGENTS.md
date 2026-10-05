# AGENTS.md

Project context for every AI agent in this repo. `CLAUDE.md` only imports this
file; edit here.

## What this repo is

`ocx-sh/website`: the shared theme library `@ocx-sh/theme`, the root site for
`ocx.sh` (`/`, `/integrations/`, `/apps/`, `/install/`), and the reusable Bunny
deploy action every section repo calls. Stack: Astro + Starlight, TypeScript,
pnpm workspace (package published to npm).

**[HANDOVER.md](HANDOVER.md) holds the settled decisions, repo layout, phases
and open questions. Read it before any design or code change.** Research trail:
`docs/research/`. Local design draft export (gitignored, may be absent):
`.tmp/design/`.

## Working here

- Current phase: 2, the root site (`site/`) and Bunny as code (`infra/`), the deploy
  action and the cutover suite. Phase 1, the library (`packages/theme/`), shipped as
  `v0.1.0`. Do not touch consumer repos before their phase-3 plan exists.
- Tokens only, never raw values; colour is the only per-scheme token family.
  Rules: `css-theming`, `typescript-quality`, `typescript-packaging`,
  `docs-quality`.
- No Web Awesome, no mdBook/MkDocs adapters (see HANDOVER "Draft items").
- Quality bar: Lighthouse 100 in all four categories; shared components typed
  and tested (Vitest + Astro Container API, Playwright under a non-root `base`).
- Iconography stays stable: never swap an icon for looks; one icon, one meaning. The set was
  chosen 2026-09-28: Lucide (UI), Simple Icons (OS, brand, shells) and a few custom glyphs. Add or
  change one in `NAME_MAP` of `packages/theme/scripts/generate-icons.mjs`, rerun
  `pnpm --filter @ocx-sh/theme icons`, and commit `icons.generated.mjs`; never edit it by hand.
- **Hard rule: an AI agent never draws, redraws or edits icon paths.** Every icon comes from
  Lucide or Simple Icons. A custom glyph is allowed only for a brand missing from Simple Icons (or
  over the 2 KB cap there), copied verbatim from a licensed upstream file whose source URL and
  licence sit next to its `NAME_MAP` entry. No licensed source exists → ask the owner; never draw one.
- Assets never cause flicker or a broken look. UI icons and the logo are
  inlined SVG (optimized, ≤ 2 KB each), never an `<img>` or `url()` that loads
  late. Every image has a reserved box (width/height or aspect-ratio), and the
  page must look identical with images blocked (e2e enforces it). Raster images
  go through Astro `<Image>`/`<Picture>` with responsive widths and avif/webp.
  Styles for first-paint content load before that content, never inside it.
- Every theme component has one page under `examples/starlight/src/content/docs/components/`
  that shows its demo and states as stories in `examples/starlight/src/stories/<slug>/`
  (`default.mdx` required); a test fails without them. A page never splits for budget.
- Zag (plan [`plan_zag-adoption.md`](.agents/plans/plan_zag-adoption.md)):
  `@zag-js/vanilla` is imported only in
  `ui/zag-runtime.mjs`, a `@zag-js/<machine>` only in a `*.zag.mjs` (D-Z17).
  Nothing loads before interaction: `mount` triggers on first hover/focus/touch;
  `visible` only for `Toc`; `manual` only for search, toaster and the mobile
  toggle (C-104); a Dialog/Drawer rendered open starts eagerly. Header nav,
  sidebar groups, mobile drawer, toaster and the CycleButton click listener mount from `Search.astro`'s
  every-page script: overriding `Search` drops them (the plugin warns).
- Budgets (JS, HTML, weight, DOM, heap) live in `tests/budgets.mjs`, enforced by
  `task e2e` and `task lighthouse`; a value only goes up with a Spec Delta.
  Run heavy gates (e2e, lighthouse, visual) one at a time: the host OOMs.
- Component tests: Astro Container (SSR) tests run in the node environment and
  DOM behaviour tests in jsdom, in separate files; the Container API cannot
  render under jsdom.
- Compound components (Tabs, Accordion) pass parent state by post-processing
  the rendered slot HTML, never by context: MDX renders slot children before
  their parent, so context passes in container tests and breaks in builds.
- Chrome overrides import no styled Starlight component: its stylesheet inlines
  into every page's HTML. Style Starlight markup in `starlight.css` instead.
- `skills/ocx-theme-*` teach agents to use this package (bundle
  `bundles/ocx-theme.toml`, published to `ghcr.io/ocx-sh/lore/<name>` by
  `publish.toml`). Every change to a component, prop, plugin option, token rule
  or the deploy action updates the matching skill in the same commit;
  `skills-coverage.test.ts` fails on an exported component or plugin option no
  skill names. Skills version with the package: each `vX.Y.Z` tag publishes npm
  and runs `grim publish --version vX.Y.Z`. Validate with
  `ocx exec -- grim publish --dry-run --version 0.0.0`.

## Commands

Tools come from `ocx.toml`; run everything through it: `ocx exec -- task <name>`.

- `task dev` — live-reload Starlight example at http://localhost:4321/docs/,
  wearing `packages/theme` straight from source. Pulls samples on first run.
- `task samples` — refresh real pages from consumer repos (`--offline` reuses
  the cache in `.tmp/samples/`).
- `task check` — the gate: lint, fmt, typecheck, test, build, css. CI
  (`.github/workflows/ci.yml`) runs check/e2e/lighthouse/pack per job; releases
  per [`RELEASING.md`](RELEASING.md). `task e2e`, `task lighthouse`,
  `task visual` and `task pack` (budgets, leak checks, Lighthouse 100×4) are
  the full gate and run before every merge alongside `task check`.
- `task lighthouse` — every example page, mobile, 100×4 plus budgets, ~2 min
  cold: 3 lanes (`LH_SHARDS`), each one long-lived Chrome; one run per URL, a
  failing URL gets 3 and is judged on its median run. A URL is skipped only
  when a previously green result has an identical key (its HTML, every local
  asset it references, tool versions, config, budgets, runner, preset);
  `LH_NO_CACHE=1` audits all, `LH_HTML=1` adds HTML reports.
  `task lighthouse:changed` is the dev alias (`LH_PRESET=desktop` allowed).
- `task site:dev` / `task site:test` — the root site (`site/`) live at
  http://localhost:4321/ and its Vitest suite. `task deploy:dev` dry-runs the deploy
  action against an in-memory fake Bunny; `task deploy:test` runs only its tests.
- `task bunny:*` — Bunny as code (`infra/bunny/`, [`README.md`](infra/bunny/README.md)).
  Offline: `bunny:test`, `bunny:plan`, `bunny:dev`. No credentials, but they hit the
  network: `bunny:verify`, `bunny:old-urls`. Write tasks read `BUNNY_API_KEY` from `.env`
  and refuse under `CI`: `bunny:onboard`, `bunny:zone:apply`, `bunny:apply`, `bunny:purge`,
  `bunny:gc`. They run locally only. The agent runs them under the owner's grant of
  2026-10-04 ([ADR 0002 Amendment 2](.agents/adr/adr_0002_phase2-bunny-cutover.md#amendment-2-2026-10-04-owner-delegation-and-rehearsal-topology));
  never put the key in CI.
- `task cutover:verify -- --host <h> [--resolve <ip>] [--dns] [--registry]` — read-only
  checks for the `ocx.sh` move; the owner runbook is
  [`infra/cutover/README.md`](infra/cutover/README.md). Edge rules derive from
  `nav.json` claims plus `infra/bunny/legacy.json`: change them in code, never in the
  dashboard.

## Agent config

Skills and rules are installed by grim from `grimoire.toml`, pinned in
`grimoire.lock`, and committed. Change them with `grim add` / `grim update`,
never by hand-editing the installed copies.
