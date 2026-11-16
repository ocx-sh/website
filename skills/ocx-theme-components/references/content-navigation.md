# Content and navigation

You loaded this file because a page shows a terminal recording or a shell session, a landing
block, keys, a breadcrumb trail, an in-page table of contents, an icon or the
logo.
Import path prefix: `@ocx-sh/theme/components/`.

Contents: [Terminal](#terminal) · [ShellSession](#shellsession) · [FeatureSection](#featuresection) · [KeyValueTable](#keyvaluetable) · [TileGrid](#tilegrid) · [Scroll effects](#scroll-effects) ·
[HubGrid](#hubgrid) ·
[Kbd](#kbd) · [Breadcrumbs](#breadcrumbs) · [Sidebar](#sidebar) · [Toc](#toc) · [Page outline](#page-outline) · [Icon](#icon) ·
[Logo](#logo) · [Chrome](#chrome) · [Starlight built-ins](#starlight-built-ins)

## Terminal

**`Terminal.astro`** plays a recorded asciinema `.cast` in terminal chrome.
The cast file loads with the page; the player JS and CSS load only when a
player is created.

| Prop | Notes |
|---|---|
| `src` | Required; root-absolute (`/casts/install.cast`), always prefixed with the site base, so write it base-relative (never `/docs/casts/…` under `/docs/`) |
| `cols`, `rows` | Default to the cast header's size when `src` is a file under `public/`; with `fit="width"` they reserve the player height before it loads (no layout shift). `rows` caps at 24: a taller recording plays in a scrolling 24-row terminal. Set both for a cast fetched from elsewhere |
| `title` | Centred in the chrome |
| `autoPlay` | Default false. Keep it: no autoplay is the docs rule |
| `speed`, `idleTimeLimit` (default 2 s), `loop` | Playback |
| `fit` | `width` (default), `height`, `both`, `none` |
| `collapsed` | Chrome only; its button expands the player (a Zag collapsible) |

Record casts from a real command run; do not hand-write them, and record at 100 to 120 columns.

The player fits the font to the frame width. Below 10px (the smallest type step, 10.5px, rounded down) it keeps
10px instead and the terminal scrolls sideways inside its frame, a focusable region named "Terminal output" that
the arrow keys scroll; a wider terminal is never clipped. A 120-column cast fits at 10px or more from about 740px of
frame, so a phone scrolls it; fewer columns scroll less. Decided when the player loads, from `cols` (the cast header's
when the prop is absent; a cast fetched from elsewhere needs `cols`, or it fits to the width as before).

## ShellSession

**`ShellSession.astro`** fuses command and output fences into one frame. Fences
alternate by position: odd ones are commands, even ones outputs. Each keeps its
own language (`sh`, `pwsh`, `nu` for commands; `text`, `log`, `json`, `toml` for
outputs). A command with no output goes in the same fence as the next command.
The `play` animation starts when the session scrolls into view.

````mdx
<ShellSession title="Lock and build">
```sh
ocx lock
```
```text
locked 3 tools in ocx.lock
```
</ShellSession>
````

| Prop | Notes |
|---|---|
| `title` | Optional title bar, also the group's accessible name |
| `play` | Types each command in a loop (40 ms per character), its output after it; pauses off screen, still under reduced motion; the box keeps its size |
| `collapsed` | Folds every output behind an `Output` toggle (a `Collapsible`); commands stay visible. Not with `play`: the build fails on both |

The slot holds code fences only; the build fails on an empty slot or on any
other content. The look is a shell: each command line gets an accent `$`, each
output line a `>`, and output text is the comment colour whatever its language.
The markers are drawn, never copied; a line after a trailing `\` continues the command and gets no `$`, its indent unchanged; so does a blank line or a `#` comment line in a `sh`, `bash`, `zsh`, `shell`, `console` or PowerShell command, so a comment never reads as a command. In the same shell fences a line that starts inside a quoted string an earlier line left open (a multi-line `export X="-----BEGIN …"`) and a heredoc body with its terminator are continuations too (a `#` comment's apostrophe opens no quote); in PowerShell so is a line after one ending in a backtick or `|`, and every line inside a `{` or `(` block left open, the closing `}` or `)` line included. A
command copies only its own text; an output has no copy button. Do not give the fences titles: the session's title replaces theirs.

**Marked lines.** A fence takes Expressive Code's markers and the line keeps its `$` or `>`, its text in the
session's one column: `{2}` highlights, `ins={2}` and `del={2}` tint green and red. A labelled marker, `{"1":2}`
(label `1` on line 2), also draws the label as a badge at the line's right edge. Highlight to draw the eye to one
line; badge when the prose must refer to a line by number. The badge is decorative (generated content, not in the
accessibility tree, never typed by `play`, never copied; under `play` it shows once its line is typed), so
**always write the legend in the prose under the session** ("Line 1 downloads the package"): colour and badge carry
no meaning alone. Keep numbered lines short; the badge sits at the line's end, not the visible box's.

````mdx
<ShellSession>
```sh {"1":1} {"2":2}
ocx install cmake:3.31
ocx select cmake:3.31
```
```text {2}
downloaded 1 package
selected cmake:3.31
```
</ShellSession>

Line 1 downloads the package. Line 2 points `current` at it.
````

A `<<<` include takes the same meta after the language, so a tested doc script can be marked:
`<<< @/_scripts/x.sh{sh {"1":1} ins={2}}` (fence `sh {"1":1} ins={2}`); in `.mdx` write
`\<\<\< @/_scripts/x.sh\{sh {"1":1} ins={2}\}`. `{sh}` alone is unchanged.

## FeatureSection

**`FeatureSection.astro`**: the alternating landing block. `title` (required,
rendered as `<h2>`), `flip` (visual on the left on desktop; mobile always
stacks text first). `eyebrow` is a small label above the heading. Slot `text`
is the copy, slot `more` a link under it, the default slot the visual. A
one-shot reveal plays once when the block scrolls in; `reveal` swaps it for a
scroll-driven fade and rise (one shared scroll listener, none under reduced motion).
`plain` makes the block a flat row (no card, two equal columns, the display heading and lead sizes, a
hairline between consecutive rows) for landing pages.

## KeyValueTable

**`KeyValueTable.astro`**: a real `<table>` in the mono font for short pairs.
`label` (required, the accessible name), `rows` (required, `{ key, value, highlight?, note? }`:
`highlight` tints the row in the accent colour, `note` is trailing text after
the value), `headers` (rows across both columns above the pairs) and `footer`
(a quiet row below). A key, and a value with its note, each stay on one
line; only a narrow screen wraps them, the note as one unit. Zero JS.

## TileGrid

**`TileGrid.astro`**: `tiles` (required, `{ title, subtitle?, icon? }`) in two
hairline-separated columns, one on a very narrow screen; `label` (required) names the list.
`icon` is a name from the theme's icon set (an unknown name fails the build; never
draw one). Slot `footer` spans all columns under the tiles: a `CommandBar` or a
command. Zero JS of its own.

## Scroll effects

One shared module (`ui/scroll.mjs`) runs a single passive, rAF-throttled scroll listener per page and
writes custom properties only. The markup is always the readable state: no JS or reduced motion shows
everything, still, at full strength. Put these below the first screen; they start readable and move once the script runs.

- **`ui/ScrollMount.astro`**: internal, no props: the one page script of ScrollFade, ScrollProgress, ScrollReveal, ScrollStage and FeatureSection, which each render it, so a page makes one request for all of them. Never use it directly.
- **`ScrollStage.astro`**: a stage pinned under the header. Default slot = the items (its children) fly in
  from the sides in pairs, then are struck through; slot `head` = the heading above; slot `finale` appears
  last. In an item, `data-stage-strike` gets the strike line, `data-stage-detail` is dropped on phones
  (an item is one line there). `label` names the section.
- **`ScrollProgress.astro`**: a thin accent bar under the header filling with the page scroll. No props;
  decorative.
- **`ScrollFade.astro`**: wraps a hero; fades out over 0.55 of a viewport of scrolling and drifts down by
  `rate` (default 0.25) of the scroll offset.
- **`ScrollReveal.astro`**: wraps a block (a closing call to action); it fades in and rises as its top edge enters
  the viewport and hides again when scrolled back up. Prop `class`; none under reduced motion.
- `FeatureSection reveal` uses the same module.

## HubGrid

**`HubGrid.astro`**: one hub page's body, read from `nav.json`. `hub`
(required, a hub id: `integrations` or `apps`; an unknown id throws) and optional `category`
(a category id of that hub, e.g. `<HubGrid hub="integrations" category="ci" />`:
only that group renders, heading kept; an id the hub lacks throws). One
group per category in `nav.json` order, one card per entry. A `planned`
entry is a dashed card with a "planned" stamp and no link; an external
`href` adds the `external` icon (↗) named "(external)". Add entries in
`nav.json`, never in the page. Zero JS.

## Kbd

**`ui/Kbd.astro`**: `keys` as `+`-joined names (`"Mod+Shift+K"`), or one key
in the default slot. `Mod` renders Cmd on mac and Ctrl elsewhere; `Alt` and
`Super` get per-OS glyphs. All variants render and CSS shows one, keyed off
`html[data-platform]` that the theme's `Head` sets before paint, so nothing
flickers. `platform` (`auto`, `mac`, `windows`, `linux`) forces one variant
at build time.

## Breadcrumbs

The page title already carries a trail (the plugin's `breadcrumbs` option).
Use **`ui/Breadcrumbs.astro`** only for a trail elsewhere: `items`
(`{ label, href?, icon? }`, outermost first, the last is the current page),
`label` (landmark name), `id`. Zero JS: past three items a narrow container
folds the middle into a native popover.

## Sidebar

**`ui/Sidebar.astro`** is the docs sidebar for a plain Astro site (a `Shell`
page), not for Starlight, which renders its own through the plugin. `groups`
(required, `{ label, href?, items: { href, label, current? }[] }[]`; an empty
`label` renders no heading, `href` links the heading), `label` (landmark name,
default `Documentation`). The page sets `current` on its own item, which gets
`aria-current="page"`. Zero JS and no request: it is plain server-rendered
links in the Starlight sidebar's look (strong heading, muted links, the current page semibold with a start bar). Place it beside `<main>` content in your
own layout (Shell has no sidebar slot).

## Toc

**`Toc.astro`** is a scroll-spy table of contents for a region inside a
page, not Starlight's page TOC. `items` (required,
`{ id, label, depth }[]`), `label`. Plain anchors work before the machine
starts; it starts when scrolled into view, one of two `visible` triggers (the other is the `play` of `ShellSession`).
Event `ocx:toc:change`.

## Page outline

Starlight's "On this page" outline, which the theme renders (`TableOfContents.astro`, `TocList.astro`); no component to
place. Plugin option `foldOutline` (default `true`; `false` keeps every outline flat).

- **What folds.** An outline of 10 rows or more (Overview and every heading row counted) folds each top-level section
  that has subsections; a section without subsections has no control, and a shorter outline stays flat: ten rows stand
  about 240 px tall, a glance. Example page: `probe/outline/` in the example site (five sections, seven subsections).
- **What is open.** The section being read: it opens as the page scrolls into it and folds when the reading moves on.
  A section the reader opened or closed by hand stays that way for the page's life, and a section holding the keyboard
  focus never folds under it. A jump (`page/#heading`) opens its section before first paint; nothing else changes at
  load, so first paint is final. While a section is folded, its title carries the current row's mark.
- **Controls.** One `<button type="button" aria-expanded aria-label="Subsections of <title>">` after the section's
  link, a 24 px target at the end of the row, with the sidebar group's chevron and motion (none under reduced motion).
  The title stays a link. A folded list is `hidden`, so its rows are out of the tab order and the accessibility tree.
- **Without JS** the buttons stay `hidden` and every row shows: the server renders the open outline, and the inline
  script that follows it folds it before first paint.
- **Phone outline.** Never folds. Its list waits in a `<noscript>` (one element; the full list without JS) and is
  parsed in on the first open, so a page carries one copy of the rows, not two. A test or script that reads
  `mobile-starlight-toc a` before the first open finds none: open the summary first.
- **Scripts.** The fold lives in the outline's inline script (about 130 B gzipped, only on an outline that folds);
  both outline elements are defined in `starlight/toc-elements.mjs`, and Starlight's own `starlight-toc` script, whose
  observer the theme's scroll spy made redundant, is not loaded.
- **Decision** (2026-11-16, theme repo ADR 0003): one `<button>` per section
  (1 element) rather than `<details>/<summary>` (2 elements per section, and a summary cannot hold the title link
  without nesting a link in a button); folding at load done by the inline script rather than `chrome.mjs`, which runs
  after first paint and would shift the outline.

## Icon

**`ui/Icon.astro`**: `name` (required, a registry name, type-checked),
`label` (makes it meaningful; without it the icon is decorative and hidden
from assistive tech), `size` `xs` 10, `sm` 11, `md` 14, `lg` 20. It inlines
the SVG in `currentColor`. The registry and how to add an icon: the
`ocx-theme-icons` skill at `../ocx-theme-icons/SKILL.md`.

## Logo

**`ui/Logo.astro`** inlines the theme's `logo.svg` unchanged. `wordmark`
(text beside the mark, mono and lowercase; default `false`, the mark only),
`size` `s` 14, `m` 20 (default), `l` 38, `xl` 84, `tone` `brand` (accent,
default) or `current` (text colour), `href` (a link; otherwise a span),
`label` (default `'ocx'`; an empty string makes it decorative, a link needs
one), `class`. The header's brand renders through it. Never redraw the mark,
edit its paths or its `fill`, or draw a wordmark SVG: colour comes from CSS.

## Chrome

**`EcosystemMenu.astro`** is the header's ecosystem mega-menu, rendered by the
theme's `Header` from `nav.json`. It is exported for the header only; never
place it in page content. The page's panel is `nav.ocx-mega#ocx-ecosystem-menu`
holding a `<noscript>` (one link per hub, to the page that lists its
destinations: what JS off shows) and one `<template data-mega>` with the body
(rail, panels, strip). The body moves into the panel on the first touch of the
header nav (the machine starts) or the panel's first open (`beforetoggle`,
which covers the phone menu's `popovertarget` and a failed machine load), so
the page pays one element for it, not ~130. `defer` is the prop: the live-header
fragment renders it off, with the body in place. A test or a consumer script that
reads `.ocx-mega__*` before the first touch finds nothing: touch the nav first.

## Starlight built-ins

The theme restyles these; import them from `@astrojs/starlight/components`:
`Aside`, `Badge`, `Card`, `CardGrid`, `LinkCard`, `Steps`. Code blocks use
Expressive Code with the theme's frame and token colours. For tabbed content
use the theme's `Tabs` and `TabItem` (see `overlays-disclosure.md`).
