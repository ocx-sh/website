# Plan: issue 12, plain-Astro sidebar and fetch-on-open Popover/Hint

Source: ocx-sh/website#12 (catalog request R13). The catalog hand-composes `DocsSidebar.astro`
(plain list, no script) and wants a version-hover preview filled by a fetch.

## Design (smallest API that deletes the catalog's code)

1. `ui/Sidebar.astro` (plain Astro, outside Starlight; Shell pages). Props:
   `groups: { label: string; href?: string; items: { href; label; current? }[] }[]`, `label?` (nav name,
   default "Documentation"). Server-rendered `<nav>` of lists, no script, nothing to load. Looks like the
   Starlight sidebar (mono-caps group label, tinted current link, same spacing tokens); `aria-current="page"`
   on the current item. A group with an empty label renders its list without a heading.
2. `src` prop on `ui/Popover.astro` and `ui/Hint.astro`: content fetched on first open.
   - Loading model (AGENTS.md): SSR writes `data-fill-src`; nothing fetches before the machine is live and
     the panel/hint opens. No prefetch, no extra chunk (`ui/fill.mjs` is imported by the two lazy `*.zag.mjs`).
   - Popover: the panel holds one `[data-fill]` region (`aria-live=polite`, `aria-busy`) with a Loader (loading)
     and a message plus Retry button (error). `src` returns an HTML fragment of the same origin (any other
     origin is an error); it replaces the region. Hint: `src` returns plain text that replaces `label`
     (the label stays on error). `labels={{ loading, error, retry }}` on Popover for i18n.
   - Cached per URL for the page's life (shared by every popover with that `src`; failures are not cached,
     Retry re-fetches). The panel is a fixed overlay, so the page never shifts; Zag re-places the panel when it grows.
   - `ocx:popover:fill` / `ocx:hint:fill` `{ ok }` after each attempt, so a consumer can enhance the fragment.
   - Tooltip.astro (term popup, non-Zag, D-Z9) is not extended: follow-up if wanted.

## Work
- Components: `ui/Sidebar.astro`, `ui/fill.mjs`, edits to Popover/Hint/popover.zag/tooltip.zag.
- Showcase: `components/sidebar.mdx` (+ stories/sidebar/default.mdx, states.mdx), popover.mdx and hint.mdx
  (props, event, stories), nav entry in the example config, a Shell example page using Sidebar.
- Tests: Container (Sidebar, Popover/Hint src SSR), jsdom (fill.mjs states: loading, ok, error, retry,
  cache, no fetch before open, cross-origin refusal), e2e (sidebar on a Shell page; popover fetch on first open
  only, cache on reopen, error+retry, no CLS).
- Skills: `ocx-theme-components` entries. Budgets unchanged (no Spec Delta expected; verify).
