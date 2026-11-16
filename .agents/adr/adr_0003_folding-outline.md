# ADR 0003: the "On this page" outline folds long outlines

- Status: Proposed 2026-11-16, implemented on `feat/docs-components`; the owner reviews it with the pull request.
  Trigger: the OCX docs owner's finding that the outline "does not use the proper new collapsible style".
- Date: 2026-11-16
- Deciders: owner (Michael Herwig); agent
- Code: `packages/theme/src/starlight/{TableOfContents,TocList,MobileTableOfContents}.astro`, `toc-elements.mjs`,
  `starlight.css` (Outline); behaviour for authors: `skills/ocx-theme-components/references/content-navigation.md`
  § Page outline.

## Context

The desktop outline was a flat list; the sidebar folds its groups (chevron, motion) and the phone outline is a
`<details>`. Budgets the change had to fit, measured before it on the example site (Chromium, 1400 px):

- DOM: the OCX docs gate every page at 900 elements and two pages sat at 908 and 903. Each page carried the outline
  twice, the desktop list and the phone list (`probe/long/`: 28 and 34 elements).
- Script before interaction: ~150 B of growth allowed on `probe/long/` and `probe/terminal/` (consumer cap
  11,264 B a page).
- Render-blocking CSS: the shared sheet was 22,523 B of a 22,550 B ceiling.
- Accessibility 100, no layout shift at load, `prefers-reduced-motion`.

## Decision

1. **Fold.** An outline of 10 rows or more folds each top-level section with subsections. Ten rows stand ~240 px
   (23.6 px a row), a third of a 768 px laptop screen: shorter outlines read at a glance, so they stay flat (every
   showcase page, 5 to 9 rows). Open: the section being read (follows the scroll), any section the reader opened or
   closed by hand (for the page's life), any section holding the focus. Plugin option `foldOutline`, **default on**:
   every consumer is an ocx.sh section, the sidebar already folds, and the docs owner asked for it; `false` opts out.
2. **Control.** One `<button aria-expanded aria-label="Subsections of …">` after the section's link (the link stays
   a link), a 24 px target with the sidebar group's chevron mask and motion rules (selectors added to those rules, no
   new mask). A folded list is `hidden`.
3. **Progressive enhancement, first paint final.** The server renders every row and the buttons `hidden`; the
   outline's inline script, which runs right after the outline and before the page paints, shows the buttons and
   folds, opening the section of a `#hash` jump. Afterwards it refolds only on a click, a scroll or a resize: never on
   the spy's first pass, so a short page whose spy lands lower at load does not move.
4. **Room.** The phone list moves into a `<noscript>` (one element; the full list without JS), parsed in on the
   first open. Starlight's `starlight-toc` element is replaced by a setter-only element of the theme's: its
   IntersectionObserver spy only ever triggered the inline spy's recompute. Starlight's base64 check-mark mask is
   re-encoded as percent-encoded SVG (same file).

Measured (Chromium, `document.querySelectorAll('*')`, script gzip before interaction), before → after:

| Page | Elements | Script before interaction |
|---|---|---|
| `probe/long/` (11 rows, 2 sections fold) | 419 → 397 (−22) | 10,828 → 10,349 B |
| `probe/terminal/` (4 rows, flat) | 331 → 323 (−8) | 12,881 → 12,269 B |
| `probe/outline/` (13 rows: 5 sections, 7 subsections, 4 fold) | 353 → 327 (−26) | 9,664 → 9,185 B |

Shared sheet 22,523 → 22,462 B (the re-encoded check mark, ~175 B, pays for the fold's rules).

## Alternatives rejected

- **Native `<details>/<summary>` per section**: 2 elements per section against 1 for the button, and a summary
  cannot hold the title link (a link inside its button role fails axe `nested-interactive`), so the title would
  leave the summary and the summary would be a second, empty control anyway.
- **Fold in `chrome.mjs`**, the every-page module where the other chrome waits: a module runs after first paint, so either the server
  renders the open outline and it shrinks after paint (`probe/outline/`: 13 visible rows to 6, ~170 px of shift),
  or the server folds it and JS-less readers need a `<noscript><style>` (one more element) while a `#hash` jump
  still opens its section late.
- **Lazy-load the toggle on first interaction**, as the Zag machines do: the scroll-follow must run before any
  interaction, and the whole fold is ~130 B gzipped inline; a chunk and its import cost more than that.
- **Phone list in a `<template>`**: no list without JS. `<noscript>` costs the same one element and keeps it.
- **Keep Starlight's `starlight-toc`**: 656 B gzipped of every-page script for an observer the inline spy made
  redundant; dropping it is what lets the fold fit the script allowance.
- **24 px for every outline row** (the link rows are 23.6 px, under axe `target-size`'s 24 px, and were before the
  fold): not taken here, it changes the reviewed row height; only a title row with a button is 24 px, so its
  button is not overlapped. Lighthouse audits the phone layout, where the desktop outline is hidden.
