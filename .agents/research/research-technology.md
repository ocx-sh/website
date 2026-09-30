# Research: technology

Axis: technology / tools. Stack: Astro 7.3 + Starlight 0.42.4 + pnpm 11 + Node 24, `@ocx-sh/theme` consumed by ~6 repos deploying to path-mounted ocx.sh sections, quality bar Lighthouse 100×4.

## Direct answer

**1. Starlight plugin surface (0.42.x).** Header/Footer overrides, `pagefind.mergeIndex` (with per-index `basePath`/`baseUrl`), and root-relative-link handling are all reachable from a plugin's `config:setup` → `updateConfig()` hook — there is no separate "plugin-only" API surface, a plugin just calls the same `updateConfig` a user's `astro.config.mjs` would. Root-relative Markdown links under a non-root `base` are **still unfixed in core**; `starlight-base-path` remains the only workaround and is peer-compatible with 0.42/Astro 7. Starlight ships CSS in a single `@layer starlight` (not sub-layered `starlight.core`/`starlight.content` as assumed) — unlayered CSS always wins the cascade over any `@layer`, so `@ocx-sh/theme`'s overrides should ship **plain, unlayered** CSS.

**2. Pagefind multi-site search.** `mergeIndex` has no documented hard cap; the maintainer calls it "vaguely efficient" with cost scaling roughly per merged site, and explicitly recommends a single aggregate `pagefind --site` pass instead once you outgrow it. Ranking across merged indexes is **not normalized** — each index scores independently and is combined via a manual `indexWeight` multiplier, so a 45-page `/docs/` section will out-rank a 5-page `/install/` section unless weighted down.

**3. oxc (oxlint/oxfmt).** Type-aware linting (via the separate `tsgolint` Go binary, not a reimplemented checker) went **stable 2026-09-11**, covering 59/61 of typescript-eslint's `recommendedTypeChecked` rules at ~12–18x the speed. But oxlint only lints `<script>` blocks inside `.astro` files — zero template linting — so `eslint-plugin-astro` stays required. `oxfmt` reached **Beta** (not 1.0) on 2026-02-24; Astro formatting support is unresolved (conflicting official docs, open tracking issues), so Prettier + `prettier-plugin-astro` remains the only fully-supported `.astro` formatter today.

**4. Lighthouse CI.** `@lhci/cli` 0.15.1 (Lighthouse 12.6.1) is current; raw `lhci autorun` against `staticDistDir` is preferable to `treosh/lighthouse-ci-action` here since this repo already has copyable `.lighthouserc.cjs`/Chrome-flag prior art in `grimoire-indexer`/`ocx-catalog`. Astro 7's stable Fonts API auto-emits correct `preload`/`crossorigin` font tags — closing the main perf gap. Pagefind's UI/WASM (~70KB+) must be dynamically imported on search-open, not eagerly bundled; Starlight's own `Search.astro` already does this — a theme's Header override must not regress it. No open Starlight issue currently zeroes a Lighthouse category, but the *theme's own* Header/Footer overrides bypass Starlight's built-in a11y hardening and need their own contrast/landmark audit.

**5. Visual regression.** Lost Pixel is **dead** (archived April 2026, team joined Figma) — do not adopt. Argos CI is live, OSS-core, with a free tier (5,000 screenshots/month) and a first-class GitHub PR diff-review UI, fitting a single-owner live-review workflow. Chromatic now supports plain Playwright (not just Storybook) but is priced for teams, not a small OSS repo. Playwright's own `toHaveScreenshot()` works but needs Docker-pinned Chrome to avoid font-rendering false positives between a dev machine and the Linux CI runner, and has no built-in review UI.

## Trends

- Rust/Go-native tooling (oxc, tsgolint on typescript-go) is closing the type-aware gap with the JS-based ESLint ecosystem within the same year, but template-language support (`.astro`, `.vue`) lags behind plain TS/JS — expect this gap to persist through 2026.
- Search and visual-regression tooling for static/multi-repo sites is converging on "index/snapshot independently, merge or review centrally" rather than one monolithic build step — matches this repo's independent-deploy model.
- Static-site perf tooling (Astro Fonts API, Starlight's own lazy Pagefind) increasingly does the hard part natively, shifting the remaining Lighthouse-100 work onto integration correctness (don't regress what the framework already got right) rather than raw optimization.

## Key findings

- Starlight plugins configure everything through `updateConfig()`; no separate plugin API for `pagefind`/`components` — [Plugins reference](https://github.com/withastro/starlight/blob/main/docs/src/content/docs/reference/plugins.md), [Configuration reference](https://github.com/withastro/starlight/blob/main/docs/src/content/docs/reference/configuration.mdx).
- Root-relative link/base-path bug still open in core; `starlight-base-path` is the maintained fix, compatible with Starlight ≥0.38 / Astro ≥6 — [andriygm/starlight-base-path](https://github.com/andriygm/starlight-base-path).
- Starlight uses one `@layer starlight`; unlayered CSS beats any layered CSS by spec — theme should ship unlayered overrides — [Starlight source](https://github.com/withastro/starlight).
- `starlight-theme-rapide`/`starlight-theme-nova` both ship raw `.astro`/`.ts` source with a loose `@astrojs/starlight >=` peer floor, never a compiled bundle — [starlight-theme-rapide](https://github.com), [starlight-theme-nova](https://github.com).
- Pagefind maintainer recommends an aggregate `pagefind --site` pass over `mergeIndex` at scale, but no tooling exists for indexing across independently-deployed CDN sections — [Pagefind discussion #564](https://github.com/CloudCannon/pagefind/discussions/564), [multisite docs](https://pagefind.app/docs/multisite/).
- `mergeIndex` ranking uses per-index `indexWeight`, not automatic cross-corpus normalization — same source.
- tsgolint reached stable 2026-09-11, 59/61 `recommendedTypeChecked` rule parity, 12–18x faster — [oxc.rs blog](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable), [InfoQ](https://www.infoq.com/news/2026/09/tsgolint-oxlint-typescript/).
- oxlint has no `.astro` template linting (open discussion, unmerged) — [oxc-project/oxc#19249](https://github.com/oxc-project/oxc/discussions/19249), [oxc#18878](https://github.com/oxc-project/oxc/issues/18878).
- oxfmt Beta (2026-02-24), Astro support unresolved/manual — [oxc.rs "Oxfmt Beta"](https://oxc.rs/blog/2026-02-24-oxfmt-beta), [compatibility matrix](https://oxc.rs/compatibility.html), [oxc#19273](https://github.com/oxc-project/oxc/issues/19273).
- `@lhci/cli` 0.15.1, Lighthouse 12.6.1 current — [npm](https://www.npmjs.com/package/@lhci/cli).
- Astro stable Fonts API auto-generates correct preload/crossorigin font tags — [Astro fonts guide](https://docs.astro.build/en/guides/fonts/).
- Lazy-loading Pagefind UI on search-open cut load time 6s→1.8s in one case study; Starlight's `Search.astro` already lazy-loads — [dev.to case study](https://dev.to/morinaga/how-i-implemented-pagefind-search-with-a-lazy-loading-native-dialog-in-astro-5-4mkl), [Starlight Search.astro](https://github.com/withastro/starlight/blob/main/packages/starlight/components/Search.astro).
- Open Starlight UX/a11y-adjacent issues as of Sept 2026: [#1748](https://github.com/withastro/starlight/issues/1748), [#1746](https://github.com/withastro/starlight/issues/1746), [#977](https://github.com/withastro/starlight/issues/977) — none zero a Lighthouse category in default output.
- Lost Pixel archived April 2026, do not adopt — [21st.dev roundup](https://21st.dev/blog/lost-pixel-alternatives).
- Argos CI: 5,000 free screenshots/month, GitHub App PR diff UI, OSS-core/self-hostable — [Argos pricing](https://argos-ci.com/pricing), [Argos GitHub](https://github.com/argos-ci/argos).
- Chromatic now integrates with plain Playwright specs, not Storybook-only — [Chromatic Playwright docs](https://www.chromatic.com/docs/playwright/).

## Sources

All fetched Sept 2026 unless noted; two closed Starlight issues (#2693, #1950) cited only as historical/fixed context, dated Dec 2024 or earlier.

- https://github.com/withastro/starlight (docs, source, issues)
- https://andriygm.github.io / https://github.com/andriygm/starlight-base-path
- https://pagefind.app/docs/multisite/
- https://github.com/CloudCannon/pagefind/discussions/564, /699
- https://oxc.rs/blog/2026-07-22-type-aware-linting-stable
- https://oxc.rs/blog/2026-02-24-oxfmt-beta
- https://oxc.rs/compatibility.html
- https://github.com/oxc-project/oxc (issues #18878, #19249, #19273, #19715)
- https://www.infoq.com/news/2026/09/tsgolint-oxlint-typescript/
- https://www.npmjs.com/package/@lhci/cli
- https://github.com/treosh/lighthouse-ci-action
- https://docs.astro.build/en/guides/fonts/
- https://dev.to/morinaga/how-i-implemented-pagefind-search-with-a-lazy-loading-native-dialog-in-astro-5-4mkl
- https://21st.dev/blog/lost-pixel-alternatives
- https://argos-ci.com/pricing, https://github.com/argos-ci/argos
- https://www.chromatic.com/docs/playwright/

## Recommendation

1. **Starlight surface**: build `@ocx-sh/theme/starlight` as a plugin calling `updateConfig` for `components.Header`/`Footer` and `pagefind.mergeIndex` (read-then-spread the existing config, don't clobber it); bundle `starlight-base-path` as a dependency rather than re-solving the base-path bug; ship the theme's CSS **unlayered** so it beats Starlight's `@layer starlight` unconditionally, matching the "consumer's plain rule wins" goal from HANDOVER.md.
2. **Search**: ship `mergeIndex` now (fits independent deploys natively); set explicit `indexWeight` per section once `/docs/`'s size visibly dominates results; defer the aggregate cross-repo `pagefind --site` pass — it needs new infra nothing in this ecosystem has yet — until ranking measurably disappoints.
3. **Tooling**: add oxlint (`--type-aware`) alongside the existing typed ESLint, not instead of it — template linting gap means `eslint-plugin-astro` stays. Keep Prettier + `prettier-plugin-astro`; revisit oxfmt once it hits 1.0 and closes its Astro tracking issues.
4. **Lighthouse**: raw `lhci autorun` against built `dist/`, copying the `.lighthouserc.cjs`/Chrome-flag pattern from `grimoire-indexer`/`ocx-catalog` rather than adding the `treosh` action as a dependency; use Astro's native Fonts API; audit the theme's own Header/Footer for contrast/landmarks since it bypasses Starlight's built-in hardening; confirm Pagefind stays lazy-loaded behind the search trigger.
5. **Visual regression**: adopt Argos CI over Playwright's bare `toHaveScreenshot()`, Lost Pixel (dead), or Chromatic (Storybook-priced, unneeded here) — free tier fits a single-owner repo and gives the PR diff-review UI the owner's live-review workflow needs; still pin screenshot generation to the CI's Docker Chrome image regardless of tool choice.
