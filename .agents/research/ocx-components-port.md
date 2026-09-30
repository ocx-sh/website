# ocx VitePress → Astro/Starlight component port inventory

Source: `/home/mherwig/dev/ocx/website/.vitepress/theme/` (components, plugins, index.mts).
Target: `/home/mherwig/dev/ocx-website` (`@ocx-sh/theme`), phase 1 = `packages/theme/`.
Goal: port every custom component without regressing the refinement history below.

## Summary table

| Component | Usages (files) | Port target | Priority |
|---|---|---|---|
| Terminal (+ Frame) | 41 (16) | Astro component + island (vanilla JS/web-component, dynamic-import player) | P0 |
| Tooltip | 22 (7) | Astro/Vue island, keep `reka-ui` or `@floating-ui/dom` — must re-satisfy DOC-EX-34 | P0 |
| Tree / Node / Description | Tree=7, Node=64, Description=48 | Custom Astro/Vue island, keep VNode-introspection API (NOT Starlight built-in `<FileTree>` — loses description column, custom icons, open/open-icon) | P0/P1 |
| FileTree / FileTreeNode | 0 direct | Internal renderer only (consumed via Tree/Node) — port together with Tree, don't expose standalone | P1 |
| FeatureSection | 12 (1, home page) | Astro component + small vanilla JS (IntersectionObserver reveal) | P0 |
| Steps / Step | Steps=1 (contentless today), Step=0 | Use Starlight's **built-in** `<Steps>` for the one real call site (already plain-list syntax); do not port custom accordion unless new need appears | P2 |
| Stepper | 0 | Drop (orphaned, superseded by Steps.vue) | Skip |
| DependencyExplorer | 1 (generated page) | Astro component, plain vanilla JS (no framework island) | P1 |
| PlatformIcons | 5 (1) | Plain Astro component, static SVG, no client JS | P1 |
| DevBanner | 0 markdown (global chrome) | Plain Astro component, build-time env flag, no island | P2 |
| HomeLayout | N/A (VitePress plumbing) | No direct equivalent — reimplement DevBanner + "early development" notice as ordinary Astro partials | P2 |
| Frame | 0 live uses | Drop (DOC-EX-12 flags hand-authored transcript mode as a zero-use mockup to delete, not port) | Skip |
| RoadmapPage/Timeline/Item/Feature/Features/Description | 1 page total, not in ocx-website phase-1 scope (absent from HANDOVER.md) | Defer to when a real roadmap page is built; docs-site-local, not theme-shared | P2/defer |

## Terminal.vue + Frame.vue

**Purpose**: asciinema-player wrapper styled as a macOS terminal window (chrome dots, optional title, optional collapse-to-click). `src=` mode (path to `.cast`) is the only mode with live usage; `<Frame at="…">` inline-transcript mode has **zero live usages** in `src/**`.

**Props** (`Terminal.vue:5-32`): `src?`, `title?`, `cols?`, `rows?`, `autoPlay?` (defaults to `props.autoPlay ?? !props.src` — false whenever `src` is set, satisfies DOC-EX-15), `speed=1`, `idleTimeLimit=2`, `loop=false`, `fit='width'|'height'|'both'|'none'`, `collapsed=false`.

**Markdown syntax** (real, `src/docs/user-guide/patches.md:120`, `src/docs/reference/command-line.md:448`):
```
<Terminal src="/casts/user-guide/patches-consumer.cast" title="Running packages with patch overlays" collapsed />
```

**Usage**: 41 occurrences across 16 files (all `src=` mode). `<Frame>` inline mode: 0 live uses.

**Behaviour**:
- Prefetch: `onMounted` eagerly `fetch()`es the cast regardless of collapsed state (`Terminal.vue:114-118,146`), so click-to-expand is instant. **Added by `2210983da` "perf: pre-fetch terminal recordings" — do not regress this**, i.e. don't defer the fetch to first click in the port.
- Player itself dynamically `import()`ed (code-split), created lazily on first open.
- Collapse/expand via `v-show` + `watch(isOpen)` calling `player.play()`/`pause()+seek(0)`, scroll-into-view on open (`:154-169`).
- Custom theme class `asciinema-player-theme-vitepress` maps ANSI 0-15 to `--vp-c-*` tokens (`:277-305`); `terminalFontFamily: var(--vp-font-family-mono)`.
- No `prefers-reduced-motion` check (known gap, SHOULD not MUST per DOC-EX-17).
- Player's own controls left enabled (DOC-EX-16 satisfied).
- No loading/error state around fetch/import.
- Cast header hardcodes `version: 2` (asciicast v2, DOC-EX-14).

**Refinement history** (`git -C /home/mherwig/dev/ocx log -- website/.vitepress/theme/components/Terminal.vue`):
- `146611f12` (2026-03-01) feat: add terminal recordings (initial).
- `7b39297aa` (2026-03-01) fix: website.
- `2210983da` (2026-03-02) perf: pre-fetch terminal recordings — **regression to avoid**: keep prefetch-on-mount.

**Asciinema integration**:
- 0 `.cast` files committed anywhere in `/home/mherwig/dev/ocx` — gitignored, build-generated at `website/src/public/casts/*.cast` by `website/recordings.taskfile.yml` (`build`/`parallel`/`bazel:build` tasks), driven by `test/recordings/*.py` + `test/recordings/cast_recorder.py`/`setups.py` running a real `ocx` binary via PTY capture (satisfies DOC-EX-12: real command, not typed transcript).
- Lint config explicitly excludes `\.cast$` from the link checker since casts don't exist pre-build (`website/taskfile.yml:22-37`).
- `asciinema-player` pinned `^3.15.1` (`website/package.json:7`), **not yet a dependency of ocx-website** — needs adding.

**Dependencies**: `asciinema-player@^3.15.1` (static CSS import + dynamic JS import).

**Tests**: none in source repo (no vitest/playwright for any theme component). Correctness comes from the DOC-EX doc-example gate (script → page binding), not component tests.

**docs-quality requirements the port must satisfy** (full text, `/home/mherwig/dev/ocx/.claude/rules/docs-quality/examples.md`):
- DOC-EX-11 (MUST): recorder stays out of the required gate.
- DOC-EX-12 (MUST pinned): every recording is a real command run, never a typed transcript; delete an unused mockup mode rather than keep it available. → **Do not port Frame.vue's inline-transcript mode** given 0 live uses; if kept, it must never masquerade as a real run.
- DOC-EX-13 (MUST pinned): commit a cast only if nothing regenerates it (satisfied: gitignored + build-regenerated).
- DOC-EX-14 (SHOULD): state cast version written + player version pinned, confirm player parses it.
- DOC-EX-15 (MUST): no autoplay when a recording source is set.
- DOC-EX-16 (MUST): player's own accessible controls stay enabled.
- DOC-EX-17 (SHOULD): check `prefers-reduced-motion` before playback (currently missing — add on port, don't just preserve the gap).

**Port recommendation**: **P0**. Astro component with a client island — since `@ocx-sh/theme` has no Vue dependency today, prefer a framework-agnostic web component / plain TS class replicating the prefetch-on-mount + lazy-init-on-open pattern (`client:idle`/`client:visible`), over adding Vue solely for this. **Drop Frame.vue** (inline mode) per DOC-EX-12 unless a concrete need for hand-authored demos resurfaces.

## Tooltip.vue

**Purpose**: inline dashed-underline term with hover/focus popup, built on `reka-ui` (`TooltipRoot/Trigger/Content/Portal/Arrow`).

**Props**: `term: string`, `side?='top'|'bottom'|'left'|'right'`, `delayDuration=400`. Default slot = popup body (rich HTML, including nested `<a>` links).

**Markdown syntax** (`src/docs/faq.md:89`):
```
ocx dependencies are pinned by <Tooltip term="OCI digest">A SHA-256 content
fingerprint...</Tooltip>, not by version ranges.
```

**Usage**: 22 occurrences across 7 files (`faq.md`, `reference/metadata.md`, `reference/environment.md`, `reference/command-line.md`, `in-depth/versioning.md`, `in-depth/storage.md`, `in-depth/dependencies.md`).

**Behaviour / a11y — load-bearing detail**: keyboard focus, pointer hover, and **Escape-to-dismiss are NOT hand-implemented in Tooltip.vue** — they come entirely from `reka-ui`'s Radix-derived primitive (`grep -rni -e tabindex -e keydown -e escape` on the file itself returns nothing). Whatever replaces `reka-ui` in the port **must independently guarantee** keyboard-reachability + Escape-dismiss, or DOC-EX-34 (MUST) fails; a naive "grep the wrapper file" check would false-negative here since the real logic lives upstream.

- Content is portaled to `document.body`; styles are **intentionally unscoped** (`Tooltip.vue:39` comment) — an Astro port using Shadow DOM/CSS Modules scoping would silently break this unless deliberately kept global.
- `z-index: 9999` tuned against VitePress's nav/sidebar stack — needs re-verification against Starlight's z-index stack, not a blind copy.
- Dark mode: explicit `.dark .vp-tt-content` override — needs remap to Starlight's dark-mode selector convention.
- 120ms fade+slide animation keyed off Radix `data-state`/`data-side` attributes — preserved automatically only if the replacement primitive emits the same attribute contract.

**Refinement history**: `dbcc8d595` (2026-02-28) initial add; `4a13f902a` (2026-03-13) broad deploy-pipeline fix (low signal, not tooltip-specific). No isolated correctness fix since inception.

**Dependencies**: `reka-ui` (not yet in ocx-website).

**docs-quality**:
- DOC-EX-33 (CONSIDER): reserve tooltips for terms that would otherwise force a definitional clause; never hide load-bearing content.
- DOC-EX-34 (MUST): hover/focus tooltip must be keyboard reachable, pointer hoverable, Escape-dismissible. Verify by tabbing to the trigger with no mouse, hovering the popup, pressing Escape. VitePress/Starlight both lack a native tooltip, so this remains a shipped component either way — not droppable.

**Port recommendation**: **P0** (22 uses, load-bearing FAQ/reference definitions). Reuse `reka-ui` again if an Astro+Vue island is otherwise adopted (keeps Escape/focus free); if going Astro-native/no-Vue, budget explicit work to reimplement keyboard-reachability, hover-intent delay, and Escape-dismiss with `@floating-ui/dom` + custom elements, and manually re-verify DOC-EX-34.

## Tree / Node / Description / FileTree / FileTreeNode

**Architecture**: `FileTree.vue`+`FileTreeNode.vue` is the imperative, data-driven renderer (`data: FileNode[]` prop). `Tree.vue`+`Node.vue`+`Description.vue` is a **declarative wrapper** that introspects `<Node>` child VNodes (`Tree.vue:30-54`, reading `name`/`icon`/`open-icon`/`open`, pulling `<Description>` text) and converts them into `FileNode[]` before delegating to `FileTree`. **All real docs content uses `<Tree>`/`<Node>`/`<Description>`; `<FileTree>` has 0 direct usages** — it's only exercised indirectly.

**Node.vue / Description.vue**: pure markers, "never rendered to DOM" per their own comments; `<slot/>` only, consumed via parent VNode introspection.

**Props** (`FileTreeNode`'s `FileNode` interface): `name`, `description?`, `children?` (presence ⇒ directory), `open?` (default expanded unless `false`), `icon?`, `openIcon?` (falls back to `icon`). Default icon table by exact filename (`metadata.json`/`manifest.json`→📋, `bin/`→⚙️, etc; generic dir→📁/📂, file→📄).

**Markdown syntax** (`src/docs/in-depth/storage.md:14-59`):
```html
<Tree>
  <Node name="~/.ocx/" icon="🏠" open>
    <Node name="packages/" icon="📦">
      <Description>immutable, content-addressed assembled packages</Description>
    </Node>
  </Node>
</Tree>
```
`open-icon` (kebab-case) used at `storage.md:75-76`.

**Usage**: `<Tree>`=7 files, `<Node>`=64, `<Description>`=48 (also used inside Steps, see below). `<FileTree>` direct=0.

**Behaviour**:
- Selection: click selects a node (single global selection via `provide`/`inject`, click again deselects); if directory+collapsible, click also toggles `open`. Custom `icon` on a node **replaces** the ▾/▸ arrow entirely — can't have both.
- Local `open` ref, **no persistence** (resets on remount).
- **No ARIA anywhere** — no `role="tree"`, `aria-expanded`, no keyboard nav — mouse-only. Zero accessibility today.
- No expand/collapse animation (instant `v-if` show/hide) — this **already violates** `subsystem-website.md:129`'s stated rule that expand/collapse must animate; don't carry that gap forward uncritically.
- Guide-lines drawn via hand-tuned `::before`/`::after` absolute-position offsets keyed to padding math — fragile geometry, not flex/grid-native.

**Refinement history**:
- `dbcc8d595` (2026-02-28) initial add.
- `1b55b24ff`/`0840a2c68` (2026-03-02) "fix: Improve tree component hover" — extracted `.ft-row--dir { cursor: pointer; }` out of the base rule so **file rows no longer show a pointer cursor**. **Regression to avoid**: don't give non-expandable file rows a clickable cursor.
- `11a6af9e7` (2026-05-07) docs content addition, no functional component diff.

No dedicated ADR found; `subsystem-website.md:60-120` is the authoritative spec (props/slots/usage/styling table).

**Starlight built-in `<FileTree>` gap analysis** (Starlight 0.42.4, `processFileTree()` → static `<details>/<summary>`):
- No click-to-select row highlighting (ocx has it).
- No per-node custom icon + separate open-icon override (Starlight auto-assigns icons by filename/extension heuristic only).
- No distinct description column (Starlight uses trailing `// comment` syntax instead — different UX, would flatten ocx's description text into inline comments).
- Starlight's version gets free native `<details>` keyboard/disclosure semantics ocx's custom version currently lacks entirely.

→ Every real usage in `src/**` relies on `<Description>` + custom icons + `open`/`open-icon`, so **migrating to Starlight's built-in would lose content** (the description column) on nearly every node. Do not use the built-in wholesale.

**Port recommendation**: **P0/P1** (Tree/Node/Description: P0 given 48-64 usage counts concentrated in heavily-trafficked in-depth docs; FileTree/FileTreeNode: P1, ship only as the internal renderer, not exposed standalone). Port as a custom Astro/Vue island preserving the `<Tree>/<Node>/<Description>` declarative API — Astro supports slot introspection via `Astro.slots.render()`, or keep a small Vue/Preact island reusing the VNode-walk pattern. Fix the file-row-cursor regression from `1b55b24ff` on port. Add expand/collapse animation and basic `aria-expanded`/keyboard support (new work, not a preserved regression, since none exists today).

## Steps.vue / Step.vue / Stepper.vue

**Steps.vue** introspects `<Step>` VNodes (`title` required, `description?`, `status?: 'complete'|'current'|'upcoming'`), builds an accordion: click-to-expand per-step detail panel (DOM-measured alignment via `getBoundingClientRect`+`nextTick`), status-driven indicator (checkmark for complete, colored connector line), 0.18s fade+translateX transition, always vertical layout, no ARIA/keyboard nav.

**Critical finding**: the **only real `<Steps>` usage** in `src/**` (`src/docs/in-depth/cosign-parity.md:181-190`) does **not** use `<Step>` children at all — it wraps a **plain markdown numbered list** directly:
```md
<Steps>

1. Publish a package to a registry of the cell's kind…
...
6. Assert the other tool **refuses** it...

</Steps>
```
Since `Steps.vue` filters VNodes on `v?.props?.title`, this produces **zero matched entries** — under the current VitePress renderer this block renders as an **empty, contentless stepper** (a pre-existing bug in the source, not something a port introduces). This markdown already matches **Starlight's own built-in `<Steps>` syntax** verbatim (confirmed live in `ocx-website/examples/starlight/src/content/docs/components/asides.mdx:26-30`, and this exact file is already sampled at `ocx-website/examples/starlight/.../samples/ocx/in-depth/cosign-parity.md`).

**Usage**: `<Steps>`=1 (currently broken/empty), `<Step>`=0, `<Stepper>`=0.

**Refinement history**: `dbcc8d595` initial add; `4a13f902a` renamed `radix-vue`→`reka-ui` import in Stepper.vue (no behaviour change).

**Starlight built-in `<Steps>` gap**: pure CSS-counter numbered list, no click-to-expand detail panel, no status concept (complete/current/upcoming), no side panel — purely static.

**Stepper.vue**: separately implemented, `reka-ui`-based twin supporting `orientation='horizontal'|'vertical'` (Steps.vue is vertical-only) and using `v-html` for step details (XSS-relevant if ported as-is). **Zero real usages anywhere**, registered globally but orphaned/superseded by Steps.vue.

**Port recommendation**:
- The one real `<Steps>` call site: **use Starlight's built-in `<Steps>` verbatim** — zero porting effort, syntax already matches. **P2** (usage=1).
- Custom `<Step>`-based accordion (status + detail panel): **do not port** unless a concrete future page needs click-to-expand, status-driven steps. If revived, keep VNode re-slotting (not `v-html`) to avoid the XSS pattern in Stepper.vue, and preserve DOM-measured panel alignment.
- **Stepper.vue: skip** (drop). If horizontal orientation is later needed, merge into the ported Steps component rather than keeping two implementations.

## DependencyExplorer.vue

**Purpose**: searchable/filterable SBOM (dependency license) viewer table on a generated docs page.

**Props/slots**: none — self-contained, fetches its own data via `onMounted` → `fetch('/data/dependencies.json')`.

**Behaviour**: search (substring match on name/description) + license `<select>` filter (AND-ed), per-row expand/collapse (keyed `name@version`), 3-stat summary cards, loading spinner, error banner on failed fetch, empty state when filtered=0, mobile layout duplicates license/links inline. No pagination, no colored license badges (plain text).

**Data pipeline** (must move alongside the component): `website/sbom.taskfile.yml` runs `cargo cyclonedx` → `scripts/sbom-to-markdown.py` → generates both the markdown page (`src/docs/reference/dependencies.md`, gitignored) and `dependencies.json` (gitignored, at `src/public/data/dependencies.json`). JSON shape: `{ generated, binaries: { [name]: { version, license, target, summary: {total, required, excluded, uniqueLicenses, licenses}, components: [{name, version, license, description, author, scope, links}] } } }`.

**Markdown usage**: `<DependencyExplorer />` with no attributes, 1 occurrence (generated page only — 0 hits in committed `src/**` since the page doesn't exist pre-build).

**Refinement history**: single commit `7166c012d` (2026-03-13), no follow-up fixes. ADR `.claude/artifacts/adr_sbom_strategy.md` covers the SBOM *generation* strategy (cargo-auditable + cargo-cyclonedx), not the website component.

**Port recommendation**: **P1**. Build as an Astro component with **no framework island** — vanilla JS for fetch/filter/toggle (<100 lines), matching the theme's established pattern (`packages/theme/src/components/EcosystemMenu.astro` uses native `popover`/`:has()`, zero framework deps — reuse that approach). Reuse `sbom.taskfile.yml`/`sbom-to-markdown.py` from the ocx repo as-is; only the consuming component and its JSON fetch path move.

## PlatformIcons.vue

**Purpose**: renders `os/arch` platform strings as OS glyphs (Tux/Apple/Windows inline SVG, `fill=currentColor` for free theming) or glyph+name+arch chips.

**Props**: `platforms: string[]` (required), `mode?='os'|'os-arch'` (default `'os'`). `os-arch` mode is coded but has **0 live usages** — all 5 real usages use `mode="os"`.

**Markdown usage** (`src/docs/installation.md:103-107`, a table):
```
<PlatformIcons mode="os" :platforms="['linux','darwin']" />
```

**Usage**: 5 (all in one table in `installation.md`).

**Behaviour**: native `title` attribute is the tooltip (not a JS component); hover-only color shift in `os` mode; no dark/light branching needed (currentColor inheritance); fade-in keyframe on render.

**Refinement history**: two commits same day/subject (`9d81ae9f8`, `364cdafa5`, 2026-06-03) — likely a fixup pair, no distinct fix history.

**Port recommendation**: **P1**. Plain Astro component, zero client JS — compute groups at build time from props, emit static SVG + native `title`. Lowest-risk port of the batch.

## Description.vue

Pure passthrough (`<template><slot/></template>`, no script) used as a data-carrier annotation inside `<Node>` (FileTree) and `<Step>` (Steps) — never renders standalone. 48 usages, concentrated in `storage.md`. Cannot be ported in isolation — its behaviour is entirely defined by the parent (`Tree.vue`/`Node.vue`) that introspects its slot content; port together with Tree/Node (see above), not separately.

## FeatureSection.vue

**Purpose**: "chess-layout" (alternating) landing-page block — text one side, terminal/image the other, scroll-triggered reveal.

**Props**: `title: string` (required), `flip?: boolean`. Slots: default → visual; named `text` → body.

**Behaviour**: scroll-position-driven `progress`/monotonic `peak` (0-1) computed from element distance-to-viewport-center, rAF-throttled scroll/resize handlers, opacity/scale/border-color/box-shadow driven by these values via inline styles and `color-mix()`. Special-cased so a fully-in-view last section at page-bottom still reaches full reveal. Grid layout flips columns + `order:-1` when `flip` is set. `:deep()` selectors reach into slotted content (`.feature-body :deep(p/code)`, `.feature-visual :deep(.terminal)`) — needs an Astro-equivalent (likely just unscoped/global CSS class selectors).

**Markdown usage**: home page only (`src/index.md:94-164`), 6 instances alternating `flip`.

**Refinement history**: single commit `16954ea87` (2026-03-29), one-shot, no fixups.

**Port recommendation**: **P0** (home page, high visibility). Astro component + small inline vanilla-JS `<script>`; recommend IntersectionObserver-based reveal (lighter than replicating the rAF+getBoundingClientRect math 1:1), but replicate the existing curve first if strict no-regression is required, then simplify. No framework island needed.

## HomeLayout.vue

Wraps VitePress `DefaultTheme.Layout`, injecting `#layout-top` → `<DevBanner/>` (every page) and `#home-features-before` → static "Early Development" notice (home page only). No props, no markdown usage — pure theme plumbing. **No Starlight equivalent needed** — Starlight's page-composition model has no matching slot-injection layer. Recommend: reimplement the two pieces of actual content (dev/staging banner, early-development notice) as ordinary Astro partials in the relevant `.astro` templates (per the existing `packages/theme/src/starlight/Header.astro` pattern), not as a layout wrapper. **P2**.

## DevBanner.vue

Fixed top banner shown when `useData().theme.value.deployTarget !== 'prod'`. No props/slots, no markdown usage (global chrome, always mounted). `role="status"` for a11y. Responsive breakpoint at 768px (wraps to 2 lines). Fixed `top:0; z-index:60` — will need layout-offset coordination with Starlight's own header stack (no evidence VitePress auto-offsets content for it either — verify before porting naively). Single commit (`23be6bdda`, 2026-05-03), no follow-up fixes.

**Port recommendation**: **P2**. Plain Astro component reading a build-time env flag (`import.meta.env.MODE` or similar) — no client JS/hydration needed, static per-build.

## Frame.vue

Non-rendering marker consumed only by Terminal's VNode introspection for the inline-transcript authoring mode. **0 live usages.** Per DOC-EX-12 ("delete an unused non-executing mockup mode rather than leave it available"), **recommend dropping** unless a concrete need for hand-authored (non-recorded) terminal demos reappears.

## Roadmap family (RoadmapPage, RoadmapTimeline, RoadmapItem, RoadmapFeature, RoadmapFeatures, RoadmapDescription)

**Scope note**: `HANDOVER.md` does not mention "roadmap" anywhere — absent from ocx-website's phase-1 scope (theme library) and from the enumerated root-site pages (`/`, `/integrations/`, `/apps/`, `/install/`). Only trace in ocx-website is a placeholder fixture (`tests/fixtures/consumer/src/content/docs/roadmap.md`, explicitly a stub for nav-link tests). **Defer — P2.**

**Composition** (single real page, `src/docs/roadmap.md`): `RoadmapPage` renders hero + a `<slot/>` filled directly with `<RoadmapItem>` elements (inline in markdown, no separate data file); each `RoadmapItem` takes `title`, `icon` (emoji or `/licensed/...svg` path), `accent` (CSS color), and a default slot of one `<RoadmapDescription>` + one `<RoadmapFeatures>` (containing `<RoadmapFeature status="shipped|active|planned" issue=".." pr=".." repo="..">Label</RoadmapFeature>` rows). **`RoadmapTimeline.vue` is registered globally but is dead code** — it implements an entirely different, incompatible data contract (`description`/`features` props instead of slotted children) and is never referenced by the live page.

**Behaviour**: vertical alternating timeline with a JS-computed gradient connector line (measured from each item's DOM position + accent color, recomputed on scroll/resize via rAF) and a scroll-driven spotlight mask; scroll-position "focus" glow per card; one-shot IntersectionObserver entrance fade (see refinement history below); status vocabulary is exactly `shipped|active|planned` at the **feature** level only (no item-level status); no filtering UI; no per-status icons beyond a colored dot.

**Refinement history** (`git -C /home/mherwig/dev/ocx`):
- `7fb271dad` (2026-03-29) initial redesign as standalone scroll-driven timeline.
- `43d3f2dc9` (2026-05-03) **fix: RoadmapItem fade-in on initial load** — root cause: items already in viewport on hydration snapped straight to `opacity:1` because the reveal class flip happened synchronously with first paint; fixed by switching to an `IntersectionObserver`-driven one-shot flag whose callback fires asynchronously after layout. **Carry this lesson into any Astro port** — Astro islands hydrate similarly late, same risk applies to FeatureSection's reveal logic too.
- `589d8c75c` (2026-04-05) added `RoadmapFeature` + issue/PR sync behaviour.
- A maintenance skill (`.claude/skills/ocx-sync-roadmap/SKILL.md` in ocx) syncs `roadmap.md` against live GitHub issue/PR state and edits the file directly — a recurring editorial workflow to preserve if/when ported.

**Port recommendation**: defer, **P2**. Not in current scope. When built: (1) apply the IntersectionObserver hydration lesson from `43d3f2dc9`, (2) drop `RoadmapTimeline.vue` entirely (dead/incompatible design, don't port it), (3) keep the `shipped|active|planned` vocabulary + issue/PR-linking convention, (4) consider moving content to structured YAML/frontmatter instead of inline component props, to make the sync skill's edits mechanical. Likely a docs-site-local Astro page, not a `@ocx-sh/theme` shared component (nothing here is reusable across consumer sites).

## Markdown plugins / build config

- `vitepress-plugin-group-icons` (`config.mts:167-190`): tab-icon matching by code-group label (case-insensitive substring, longest key first); custom icon overrides for `shell`/`powershell`/`nushell` (iconify) and local SVGs for `fish`/`elvish` (no bundled iconify glyph). Needs an Expressive Code (Starlight's code-block engine) equivalent — check if `expressive-code` plugins cover tab icons, or if this needs a custom Starlight remark/rehype plugin.
- `licensed-asset-fallback.mts` (`.vitepress/plugins/`): Vite plugin stubbing missing `/licensed/` asset imports at build time (Icons8 SVGs are gitignored, only exist locally/deployed separately via `task website:deploy:licensed`). Needed again if the Astro build resolves the same `/licensed/` paths and CI lacks the real assets.

## docs-quality requirements the port must satisfy (full rule text)

From `/home/mherwig/dev/ocx/.claude/rules/docs-quality/examples.md`:

- **DOC-EX-11** (MUST): "Keep the recorder out of the gate so the example suite passes or fails without it."
- **DOC-EX-12** (MUST pinned): "Produce every terminal recording by running a real command, never by typing a transcript. Delete an unused non-executing mockup mode rather than leave it available." → drop Frame.vue.
- **DOC-EX-13** (MUST pinned): "Commit a recording only when no build step regenerates it."
- **DOC-EX-14** (SHOULD): "State the cast version you write and the player version you pin, and check the player parses it."
- **DOC-EX-15** (MUST): "Default a recording-bound player to no autoplay."
- **DOC-EX-16** (MUST): "Leave the embedded player's own accessible controls enabled."
- **DOC-EX-27** (MUST): "Never make a live sandbox the reader's only way to see a documented example." (N/A today — no live sandbox in this repo; keep in mind if one is added later.)
- **DOC-EX-33** (CONSIDER): "Reserve a tooltip or an abbreviation for a term that would otherwise force a definitional clause into the sentence. Never hide content the reader must read to follow the page."
- **DOC-EX-34** (MUST): "Make a hover or focus tooltip keyboard reachable, pointer hoverable, and dismissible with Escape." Verify by tabbing to the trigger with no mouse, hovering the popup, and pressing Escape.

## Top regression risks (cross-cutting)

1. **Terminal prefetch-on-mount** (`2210983da`) — losing this reintroduces click-to-play latency.
2. **Tooltip's Escape/keyboard/hover behaviour is entirely upstream (`reka-ui`)** — a naive port that drops or replaces this primitive without independently re-verifying DOC-EX-34 will silently fail accessibility.
3. **FileTree/Tree's file-row cursor fix** (`1b55b24ff`) — don't give non-expandable rows a pointer cursor.
4. **Steps' one real call site already renders empty/broken** under the current component (VNode filter mismatch with a plain numbered list) — the fix is to use Starlight's native `<Steps>` for that content, not to "fix" the custom component.
5. **RoadmapItem/FeatureSection scroll-reveal hydration timing** (`43d3f2dc9`) — Astro islands hydrate late like VitePress; use IntersectionObserver-driven one-shot flags, not synchronous scroll-position class flips, or above-the-fold content will flash in wrong.
6. **Every component's CSS vars are VitePress `--vp-c-*`/`.dark`-class specific** — all need explicit remap to `@ocx-sh/theme`'s token set and Starlight's dark-mode convention; no automatic carryover.
7. **No test coverage exists anywhere in the source** — the port carries no regression baseline; budget new Vitest + Astro Container API / Playwright tests as part of the port itself, not as follow-up.
