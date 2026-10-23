---
title: Markdown
description: GitHub and GitLab Markdown that renders with the theme's components, in plain .md files.
---

<!-- This page is plain Markdown on purpose: every widget below needs no import. This comment never reaches the HTML. -->

The theme renders GitHub- and GitLab-flavoured Markdown with its own components at build time.
A README written for GitHub reads the same here, and none of it ships JavaScript. `{#id}` after a
heading sets its id, and a link to a page's `.md` file becomes its route, so links work on GitHub
and here alike: [Code](./code.md#top). Each example below shows its source, then the result.

## Alerts

GitHub's five alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) and GitLab's
title form become asides. So do `:::warning`, `:::info` and `:::important`, the VitePress names
Starlight lacks (as caution, note and note).

```md
> [!NOTE]
> Worth knowing, even when skimming.

> [!warning] Data deletion
> `ocx clean` removes unreferenced packages.
```

> [!NOTE]
> Worth knowing, even when skimming.

> [!TIP]
> A shortcut to a better result.

> [!IMPORTANT]
> Needed to succeed.

> [!WARNING]
> Needs attention right away.

> [!CAUTION]
> Risks of an action.

> [!warning] Data deletion
> `ocx clean` removes unreferenced packages.
## Collapsibles

A native `<details>` looks like the [Collapsible](../collapsible/) component and needs no script.

```md
<details>
<summary>What does ocx install write?</summary>

Packages land in the content-addressed store.

</details>

:::details[Open by default]{open}
The directive form takes Markdown in its title and an `open` attribute.
:::
```

<details>
<summary>What does ocx install write?</summary>

Packages land in the content-addressed store.

</details>

:::details[Open by default]{open}
The directive form takes Markdown in its title and an `open` attribute.
:::

## Emoji and inline changes

GitHub's shortcodes become emoji. Unknown names, code, and a shortcode inside a word stay as written:
`` Shipped :rocket: :+1: · `:rocket:` · :not-an-emoji: · index:package:1 `` renders as

Shipped :rocket: :+1: · `:rocket:` · :not-an-emoji: · index:package:1

GitLab's `{+ added +}` and `{- removed -}` mark inline changes, and `[[_TOC_]]` is dropped: the page
already has a table of contents. `{- the home directory -}` and `{+ the XDG data directory +}` render as:

The default moved from {- the home directory -} to {+ the XDG data directory +}.

## Task lists, footnotes, tables

GitHub's own syntax, unchanged, in the theme's prose styles:

- [x] Install ocx
- [ ] Pin the toolchain[^lock]

| Command       | Writes                |
| ------------- | --------------------- |
| `ocx install` | ~~nothing~~ the store |

[^lock]: `ocx lock` writes `ocx.lock` next to `ocx.toml`.

## Math

A `math` fence holding `\sum_{i=1}^{n} s_i \le q` renders as MathML: the browser lays it out,
with no script, stylesheet or font. `$…$` and `$$…$$` need `ocxTheme({ math: true })`, so prose
about `$HOME` stays text.

```math
\sum_{i=1}^{n} s_i \le q
```
