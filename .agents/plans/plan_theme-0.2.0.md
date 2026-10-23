# Theme 0.2.0: harden catalog drop-ins, land, release

## Context
`main` of ocx-website carries ~74 modified + ~50 untracked files written fast for the OCX catalog
(`../ocx-catalog`, branch `hex/plan-ocx-theme-port`, PR ocx-sh/catalog#18). Catalog consumes the theme via
`file:` and its CI blocks merge until `@ocx-sh/theme` 0.2.0 is on npm. Goal: production quality,
homogeneous with existing components, fully tested, one reviewed PR, then release v0.2.0.

## Owner decisions (2026-10-23)
- Theme toggle: **revert to state glyph** (sun = light, moon = dark). Keep OS follow, `auto` storage,
  legacy `vitepress-theme-appearance` migration, iOS platform fix.
- Shell global CSS: **keep as default**, move into `@layer ocx` + `:where()`, tokens only; list as breaking.
- "Unused" API: verified in catalog — `extraNav`, `extraFooterLinks`, `match:'prefix'`, `./copy`,
  `ocx:command-bar:set` all used (`src/site/layouts/Page.astro:57-62`, `client/detail.ts`, `client/grid.ts`). **Keep all.**
- CommandPalette: **keep hand-rolled list + explicit `mountCommandPalette`**, harden.

## Step 0 — branch
`git switch -c feat/theme-0.2.0` (carries the WIP off `main`). No `backup/*-pre-finalize` for main; no active discussion.

## Step 1 — hardening (sonnet workers via /hex-execute, one per group, skills updated in same commit)
1. **Types.** `pnpm --dir packages/theme run prepack`; commit new `copy`, `logo-tile`, `command-palette` `.d.mts`
   and refreshed `data-table`, `theme-toggle`, `toast`. New test: every `types` path in `package.json` exists
   (would have caught this).
2. **Theme toggle** (`ThemeSelect.astro`, `base.css` toggle rule, `theme-toggle.mjs`, `head-scripts.mjs`):
   revert glyph; jsdom tests for `storedTheme`, OS-change follow, `auto` write, legacy-key migration,
   `PLATFORM_SCRIPT` iPhone/iPad. Regenerate CSP inline-script hashes.
3. **Shell CSS** (`layouts/Shell.astro:121-160`, `base.css` footer ~573-605): `@layer ocx`, `:where()`,
   tokens for line-height/font-size; replace `border-image`/`100vw` bleed with token-based rule; drop
   catalog wording ("freshness stamp"). e2e `shell.spec.ts` covers layout.
4. **Header/footer links** (`SiteHeader.astro`, `SiteFooter.astro`, `nav.mjs`): one helper for external-link
   attrs + icon used by header nav, drawer, extra nav, footer (today copied 4×). Unit tests for
   `currentHref` (longest prefix, `match`) and `isExternal` in node.
5. **Set-from-code** (`ui/value-set.mjs`, `select.zag.mjs`, `toggle-group.zag.mjs`, `command-bar.mjs`):
   one shared listener helper in `value-set.mjs`; replace value-equality `silent` WeakMap with one-shot
   flag (user change to same value no longer swallowed); shrink `command-bar.mjs:103-140`.
   jsdom tests for all three `*:set` events, stale-row removal, `option.data`.
6. **DataTable / overlay**: scope new `white-space:nowrap` to tables with a `grow` column (no silent break);
   verify icon rows in `overlay.css` keep a selected indicator. Tests: `align`, `grow`, `require`,
   paged min-height.
7. **Control sizes**: SSR tests for `size` on Select, Popover, ToggleGroup; tag/overlay `[data-size]`.
8. **CommandPalette** (`ui/command-palette*.mjs|.css|.astro`): raw `12vh/70vh/100vw/90vw/560px/0.08em`
   → tokens; sr-only block → existing visually-hidden utility; types from item 1 replace catalog's hand
   mirror; document explicit mount + `ocx-header__search` reuse in skill.
9. **LogoTile**: move `logo-tile*.mjs` into `ui/` beside the component (keep export path `./logo-tile`);
   px map in `LogoTile.astro:27` checked against size tokens by test; svg→png guess
   (`logo-tile-install.mjs:21-25`) → explicit `fallback` src prop; load install script as one module so
   consumers no longer need the `inlineLimit` hack.
10. **Copy**: export `CopyMenu` `Props`; direct unit test for `copy.mjs`; test guarding the
    `clipboard.zag.mjs` `reenter` state clone and `copy-menu.zag.mjs` context-trigger props against Zag shape.
11. **Polish group** (Drawer z token, link/field/skeleton/tag CSS, SearchField `clearLabel`): confirm tokens only.
Skipped: stripping plan IDs from comments — siblings carry them; separate sweep if code-docs check is adopted.

## Step 2 — gates (one heavy gate at a time, host OOMs)
`ocx exec -- task check` → `task e2e` → `task visual` → `task pack` → `task lighthouse:changed`.
Budgets in `tests/budgets.mjs` never raised without Spec Delta.

## Step 3 — owner look + review
- Owner reviews in `task dev` (memory: no push before owner review). Catalog relinked to the branch checkout.
- `/hex-review` (tier auto, codex cross-model); fix loop until approved.

## Step 4 — commits + PR
`/hex-finalize` recomposes the series by theme: icons → set-from-code → CommandBar/DataTable →
polish → copy/toast → theme toggle → header/footer links → Shell props → Shell CSS → new components →
`chore(release): 0.2.0` (`packages/theme/package.json`, `publish.toml` pins). PR body lists breaking
changes: Shell globals + footer, neutral external links open new tab, single `aria-current`,
toast title `Copied — x`, copy toast 2 s. Push branch, open PR, watch CI to green (reruns mine).

## Step 5 — land + release (owner)
Owner lands (signed linear main, local push). Then `LH_NO_CACHE=1 ocx exec -- task lighthouse` on main,
owner tags `v0.2.0` per `RELEASING.md`; I watch `release.yml` and verify npm + ghcr skills.

## Step 6 — catalog follow-up (branch in `../ocx-catalog`)
Swap `file:` → `^0.2.0`; delete hand-written types (`virtual.d.ts`, `client/palette.ts` mirror),
`inlineLimit` hook; pass LogoTile `fallback`. Unblocks ocx-sh/catalog#18.

## Verification
All Step 2 gates green locally; CI green on PR; `task pack` leak checks; catalog builds against packed
tarball (`pnpm pack` → install in catalog) before tag.

## Pipelines

| Pipeline | Items | File set | Status |
|---|---|---|---|
| chrome | 2, 3, 4 | `ThemeSelect.astro`, `starlight/theme-toggle.mjs`, `head-scripts.mjs`, CSP hash source, `base.css`, `layouts/Shell.astro`, `SiteHeader.astro`, `SiteFooter.astro`, `nav.mjs`, `nav.d.ts`, their tests + e2e (`shell.spec.ts`, theme tests) | merged |
| controls | 5, 6, 7, 11 | `ui/value-set.mjs`, `ui/select.zag.mjs`, `ui/Select.astro`, `toggle-group.zag.mjs`, `ToggleGroup.astro`, `ui/command-bar.*`, `ui/CommandBar.astro`, `ui/DataTable.astro`, `ui/data-table.mjs`, `ui/overlay.css`, `ui/Popover.astro`, `ui/tag.css`, `ui/field.css`, `ui/link.css`, `ui/skeleton.css`, `ui/Drawer.astro`, `ui/SearchField.astro`, their tests + e2e | merged |
| components | 8, 9, 10 | `ui/CommandPalette.astro`, `ui/command-palette*`, `ui/LogoTile.astro`, `logo-tile*.mjs` (→ `ui/`), `CopyMenu.astro`, `copy*.mjs`, `copy-host.mjs`, `copy-menu.zag.mjs`, `clipboard.zag.mjs`, `CopyButton.astro`, `toast*.mjs`, `starlight/toaster*.mjs`, `ProseCodeCopy.astro`, `prose-code-copy.*`, `tokens.css`, `package.json`, their tests + e2e, examples pages/stories | merged |

Integration (orchestrator, serial after merges): `prepack` `.d.mts` regen + item 1 test, skill updates
under `skills/ocx-theme-*`, then Step 2 gates.

## Status
- State:   done
- Updated: 2026-10-23
- Next:    land via signed FF push, tag v0.2.0, ping catalog migration
- Reviewed: xhigh panel + codex adversary, 2 fix passes, delta round Approve
- Quality: task check, e2e (search-dialog mobile flake passed on rerun), pack, full uncached Lighthouse green
