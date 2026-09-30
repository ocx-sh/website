# Content and navigation

You loaded this file because a page shows a terminal recording, a landing
block, keys, a breadcrumb trail, an in-page table of contents or an icon.
Import path prefix: `@ocx-sh/theme/components/`.

Contents: [Terminal](#terminal) · [FeatureSection](#featuresection) ·
[Kbd](#kbd) · [Breadcrumbs](#breadcrumbs) · [Toc](#toc) · [Icon](#icon) ·
[Chrome](#chrome) · [Starlight built-ins](#starlight-built-ins)

## Terminal

**`Terminal.astro`** plays a recorded asciinema `.cast` in terminal chrome.
The cast file loads with the page; the player JS and CSS load only when a
player is created.

| Prop | Notes |
|---|---|
| `src` | Required; root-absolute (`/casts/install.cast`), resolved against the site base |
| `cols`, `rows` | Set both: with `fit="width"` they reserve the player height before it loads (no layout shift) |
| `title` | Centred in the chrome |
| `autoPlay` | Default false. Keep it: no autoplay is the docs rule |
| `speed`, `idleTimeLimit` (default 2 s), `loop` | Playback |
| `fit` | `width` (default), `height`, `both`, `none` |
| `collapsed` | Chrome only; its button expands the player (a Zag collapsible) |

Record casts from a real command run; do not hand-write them.

## FeatureSection

**`FeatureSection.astro`**: the alternating landing block. `title` (required,
rendered as `<h2>`), `flip` (visual on the left on desktop; mobile always
stacks text first). Slot `text` is the copy, the default slot the visual. A
one-shot reveal plays once when the block scrolls in.

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

## Toc

**`Toc.astro`** is a scroll-spy table of contents for a region inside a
page, not Starlight's page TOC. `items` (required,
`{ id, label, depth }[]`), `label`. Plain anchors work before the machine
starts; it starts when scrolled into view, the only `visible` trigger.
Event `ocx:toc:change`.

## Icon

**`ui/Icon.astro`**: `name` (required, a registry name, type-checked),
`label` (makes it meaningful; without it the icon is decorative and hidden
from assistive tech), `size` `xs` 10, `sm` 11, `md` 14, `lg` 20. It inlines
the SVG in `currentColor`. The registry and how to add an icon: the
`ocx-theme-icons` skill at `../ocx-theme-icons/SKILL.md`.

## Chrome

**`EcosystemMenu.astro`** is the header's ecosystem mega-menu, rendered by the
theme's `Header` from `nav.json`. It is exported for the header only; never
place it in page content.

## Starlight built-ins

The theme restyles these; import them from `@astrojs/starlight/components`:
`Aside`, `Badge`, `Card`, `CardGrid`, `LinkCard`, `Steps`. Code blocks use
Expressive Code with the theme's frame and token colours. For tabbed content
use the theme's `Tabs` and `TabItem` (see `overlays-disclosure.md`).
