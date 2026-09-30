# UI primitives (WP14): inventory, contract, split

Look source: `.tmp/design/OCX Components.dc.html` (c-button, c-input, c-select,
c-combobox, c-choice, c-tags, c-menu, c-feedback, c-callout) and `OCX Design
Guide.dc.html` › interaction rules. Stubs: `packages/theme/src/components/ui/`.

## Inventory

| Element | Native element | Styling lives in | Divergence from the sheet |
| --- | --- | --- | --- |
| Header section links + ecosystem trigger | `<a>`, `<button popovertarget>` | `starlight/Header.astro` | none |
| Header install | `<a>` | `Header.astro` | 30px = button s: matches |
| Header search trigger | Starlight `<site-search> > button` | `starlight.css`, `Header.astro` | 32px, surface-subtle fill; sheet input 38px, surface fill |
| Pagefind search dialog (input, results, cancel) | Starlight `<dialog>` + Pagefind UI | `starlight.css` (`site-search dialog`, `--pagefind-ui-*`) | only radius/border mapped; input height, font, focus and the cancel button are Pagefind defaults |
| `.sl-menu-button` (mobile drawer toggle) | Starlight `<button>` | `starlight.css` | ghost icon button at `--sl-menu-button-size`, not a Button size |
| `.ocx-kbd` | `<kbd>` | `base.css:42` | none (matches c-feedback kbd) |
| EcosystemMenu | `<div popover>`, radio rail, `<a>` rows | `EcosystemMenu.astro` | none (it *is* c-menu) |
| ThemeSelect | `<button>` icon | `ThemeSelect.astro` + `.ocx-header__tool` | 30px ghost icon; sheet icon button 38px bordered |
| MobileMenuFooter | `<a>` list | `MobileMenuFooter.astro` | none |
| Tooltip | `<button>` + `popover=manual` | `Tooltip.astro` | **surface card, sans 13, 2px radius, arrow**; sheet: inverted ink, mono 11.5, no arrow |
| Terminal collapse | `<button aria-expanded>` chrome | `Terminal.astro` | none |
| Terminal player controls | asciinema DOM | vendor CSS in `@layer ocx.vendor` | vendor look |
| Terminal loading | min-height reserve, no indicator | `Terminal.astro` | no loader while the player JS loads |
| Tree | `<details>/<summary>` | `TreeNode.astro` | none |
| PlatformIcons chips | `<span role=img>` | `PlatformIcons.astro` | outline, not caps: neither label nor stamp |
| DependencyExplorer search | `<input type=search>` | `DependencyExplorer.astro` | **32px, border-strong, sans**; sheet 38px, border, mono 12.5, focus = border |
| DependencyExplorer licence | native `<select>` | `DependencyExplorer.astro` | **OS picker** (the "all licenses" complaint); 32px, no chevron |
| DependencyExplorer rows | `<button aria-expanded>` in `<td>` | `DependencyExplorer.astro` (`:global`) | none |
| DependencyExplorer loading | `<p role=status>` + spinner | `DependencyExplorer.astro` | bespoke; the loader to extract |
| DependencyExplorer error / noscript | `<p role=alert>` | `DependencyExplorer.astro` | full danger border + 2px radius; c-callout = hairline + 3px marker |
| FeatureSection | static | `FeatureSection.astro` | none |
| EC frame + copy button | Expressive Code | `starlight.css` | none |
| Starlight tabs, pager, link cards, asides | Starlight | `starlight.css` | none (aside *is* c-callout) |
| Starlight `LinkButton` | `<a>` | `starlight.css` | Starlight heights, not 38/42 |

### Divergences (ranked)

1. **Licence `<select>` opens the OS picker.** The Select primitive (WP14b, WP14c) fixes it.
2. **Control heights have no system:** 28 (header tool), 30 (install), 32 (search, deps controls), against 38/42 in the sheet. No 38/42 token exists yet.
3. **Tooltip is a card, not a tooltip.** Owner decision, after WP11b releases the file.
4. **Field focus:** deps uses the 2px ring; the sheet uses a 1px border colour change. Contract: border in `--ocx-color-focus` (5.4:1 on light, meets 1.4.11).
5. **Loader is private to DependencyExplorer**; Terminal has none.
6. **Error box** is not the callout shape.
7. **Pagefind search input** is untokenised (height, font, focus).
8. PlatformIcons chips match neither tag variant.
9. **The sheet contradicts itself.** c-select uses an accent tint for the keyboard highlight, and the guide says coral is never a row hover. Contract: keyboard/active highlight = accent-tint + fg; pointer hover = surface-subtle.

## Contract

Common rules:

- Block class `ocx-ui-<name>`, BEM `__part`, modifiers as `data-*`.
- Every primitive takes a `class` pass-through.
- Styles live in a per-component `<style>` wrapped in `@layer ocx`, the pattern every existing component uses. Astro dedupes them per page.
- **One shared sheet, `ui/overlay.css`.** It is imported from the frontmatter of Select, Combobox and Menu. An imported file is neither scoped nor layered, so it wraps its whole body in `@layer ocx` itself.
- **Runtime-built DOM carries no `data-astro-cid`.** Styles for options, `::checkmark` and option meta therefore live in `overlay.css`, or under `:global(...)` in a component. The same applies to anything a consumer appends at runtime.
- **`::picker(select)` gets its own rule** inside `@supports (appearance: base-select)`. It never shares a selector list with `.ocx-ui-overlay`, because Firefox drops the whole list. Both rules read the same local custom properties (`--_ov-bg`, `--_ov-border`, `--_ov-radius`, `--_ov-shadow`, `--_ov-pad`), which are set on `:root` inside `overlay.css`.
- **`[hidden] { display: none }`** is required in every component whose parts set `display`: Loader, and the Combobox clear/empty parts.
- Tokens only. Where no token exists, compose one with `calc()` of tokens (see Token gaps).
- Focus is `:focus-visible` → `outline: var(--ocx-focus-ring)` + `outline-offset: var(--ocx-focus-offset)`. Fields are the exception (see Input).
- IDs come from `ui/ids.mjs › nextUiId(prefix)`, a deterministic counter.
- **No flicker:** fixed block-size at first paint, popups in the top layer, and first-paint text and values are final.

Height stopgap:

- `H38` = `calc(var(--ocx-control-xl) + var(--ocx-space-2) + var(--ocx-space-1))`
- `H42` = `calc(var(--ocx-control-xl) + var(--ocx-space-3) + var(--ocx-space-1))`
- Each use carries `/* ponytail: swap to var(--ocx-control-2xl|3xl) once tokens.css has it */`.

| Primitive | Props (see stub) | Markup / ARIA | Tokens | JS |
| --- | --- | --- | --- | --- |
| **Button** | `variant` primary/secondary/ghost, `size` s/m/l, `iconOnly`, `href` → `<a>`, else `<button type=button>`; rest spread | `.ocx-ui-button[data-variant][data-size][data-icon-only]`; icon-only needs `aria-label` | height s `control-lg` / m H38 / l H42; pad s `0 space-4`, m/l `0 space-5`, ghost `0 space-3`; font s mono `text-sm` 500, m sans `text-base` (primary 600, else 500), l `text-md` 600; `radius-md`; `border-width`. primary: bg+border `accent`, fg `on-accent`, hover `accent-hover`. secondary: bg `surface`, border `border`, hover border `accent`. ghost: fg `fg-muted`, no border. disabled: bg `surface-subtle`, border `border`, fg `fg-subtle`. icon-only: inline-size = block-size | none |
| **Input** | `label`, `hideLabel`, `type` text/search/url/email, `hint`, `error`; rest spread | `.ocx-ui-field` > `label.ocx-ui-field__label[data-hidden]` + `input.ocx-ui-input[aria-invalid][aria-describedby]` + `p.ocx-ui-field__msg` | height H38; pad `0 space-4`; mono `text-sm`; bg `surface`; border `border-width` `border`; placeholder `fg-subtle`; focus: border-color `focus`, no outline; error: border + msg `danger`; disabled: bg `surface-subtle`, fg `fg-subtle`; label `text-sm` 500 `fg`; msg `text-sm` `fg-subtle` | none |
| **Choice** | `type` checkbox/radio/switch, `label`; rest spread | `label.ocx-ui-choice[data-type]` > `input.ocx-ui-choice__input` (`role=switch`) + `span.__label` | `appearance:none`; box `space-5`, border `border-strong`, bg `surface`; checked bg+border `accent`, mark `on-accent`; disabled bg `border-strong`, fg `fg-subtle`; radio `radius-full`, dot `space-3`; switch `control-xl` × `control-xs`, pad `space-1`, square thumb `space-4` (off `fg-subtle` on `surface-subtle`, on `on-accent` on `accent`); label `text-base`, gap `space-3` | none |
| **Tag** | `variant` label/stamp, `tone` neutral/keyword/success/warning/danger, `class` | `span.ocx-ui-tag[data-variant][data-tone]` | mono `text-2xs`, `radius-sm`. label: 500, fg = tone, bg = tone-tint (neutral `fg-muted` on `surface-subtle`), pad `space-1 space-3`. stamp: 600, caps, `tracking-caps`, border in tone (neutral `border-strong`/`fg-subtle`) | none |
| **Loader** | `label` = "Loading…", `size` s/m, `class` | `span.ocx-ui-loader[role=status][data-size]` > `__spinner[aria-hidden]` + `__label`. **Always rendered** (never `hidden` at first paint, so the live region exists before any change). The consumer swaps `__label` text to report progress, then hides the loader once content lands. The consumer sets `aria-busy` on its region | spinner m `control-sm` / s `icon-md`; border `border-width-strong` `border`, top `accent`, `radius-sm`; label `fg-muted` (s `text-sm`); gap `space-4`/`space-3`. Spin `calc(var(--ocx-duration-slow) * 3) linear infinite` only under `prefers-reduced-motion: no-preference`; reduced = static square + text. `@media (scripting: none)` → hidden | none |
| **Skeleton** | `lines` = 3, `class` | `span.ocx-ui-skeleton[aria-hidden]` (`--_lines`) > `__line`×n | lines 1lh, bar `surface-subtle`, last line 60% wide; block-size `calc(var(--_lines) * 1lh)`; static | none |
| **Select** | `label`, `hideLabel`, `options` {value,label,meta?,disabled?}, `value`; rest spread | `.ocx-ui-field.ocx-ui-select` > label + `span.__box` > `select.__control` > `option.__option` (`__option-label`, `__option-meta` " (n)") + `svg.__icon` | closed box = Input box + chevron `icon-md` `fg-subtle`. **`__control` has a fixed inline-size** (`calc(var(--ocx-space-12) * 2 - var(--ocx-space-5))`, the current deps width) so runtime options cause no CLS. Open: border `focus`, chevron rotated. `@supports (appearance: base-select)`: `select { appearance: base-select }`; separate rule `::picker(select) { appearance: base-select; /* --_ov-* */ }`; `::picker-icon` hidden; `::checkmark` `accent-fg`. Fallback: `appearance:none` closed box + OS picker | none (native) |
| **Combobox** (vocabulary only) | `label`, `hideLabel`, `options`, `value`, `placeholder`, `class`; static-state props `open`, `highlighted`, `query`, `empty`, `disabled` | APG combobox attributes and Zag `data-part` names; the input `value` = the selected option's label (first paint final). `__foot` uses `<kbd class="ocx-kbd">`. **Not usable:** it ships only the CSS vocabulary until a behaviour source is decided; the showcase renders its static states inside an `inert` block | control = Input + search `icon-md` + clear `text-xs`; option = overlay row; match `<mark>` `fg` 600, underline `accent`, offset `prose-link-offset`; foot border-top `border`, `text-2xs` `fg-subtle`; empty dashed `border-strong` | blocked on the headless-library decision |
| **Menu** | `label`, `items` {label,href,current?}, `align` start/end, `class` | `.ocx-ui-menu[data-align]` > `Button.__trigger[popovertarget]` + `nav.ocx-ui-overlay.__popup[popover][aria-label]` > `a.__item[aria-current]`. Disclosure navigation, not `role=menu` | row pad `space-3 space-4`, `text-base`; hover/focus `surface-subtle` + `fg` + `fg-subtle` arrow; current `accent-fg` on `accent-tint`. **Anchoring:** the implicit anchor from `popovertarget` (`position-area: block-end span-inline-end`, `end` → `span-inline-start`). **Fallback** (no anchor positioning): `position: fixed; inset: var(--ocx-header-height) var(--ocx-space-5) auto auto`. Known limitation: the fallback pins under the header at the end edge, not under the trigger (a top-layer popover's containing block is the viewport, so an absolute parent cannot anchor it) | none new: Popover API + existing `closeOnFocusOut` |
| overlay.css | none | `@layer ocx { … }`. `.ocx-ui-overlay` = popup surface. Option rows use `:global` class selectors only | `--_ov-bg: surface`, `--_ov-border: border-width border`, `--_ov-radius: radius-lg`, `--_ov-shadow: shadow-overlay`, `--_ov-pad: space-2`; z `z-popover`. Row: grid `space-5 1fr auto`, gap `space-3`, pad `space-3 space-4`, mono `text-sm`; highlighted (`:focus-visible` / `[data-highlighted]`) `accent-tint` + `fg`; hover `surface-subtle`; checked `accent-fg` + ✓; meta `text-xs` `fg-subtle` | none |

**c-callout = Starlight `<Aside>`.** It is already restyled in `starlight.css`, so there is no Callout primitive. The DependencyExplorer error and noscript notice reuse the aside classes and markup (`.starlight-aside.starlight-aside--danger`, `__title`, `__content`). Extract a Callout component only when a second consumer outside Starlight appears.

**Skipped** (ponytail, no consumer; add each when one appears): segmented control, filter-toggle chip, `Select multiple`, Combobox groups and the docs-search empty link, Menu type-ahead, toast.

### Token gaps (tokens.css is read-only here)

- **Control heights 38 and 42.** wp11b-tokens has been asked for `--ocx-control-2xl: 38px` / `--ocx-control-3xl: 42px`. Until then the H38/H42 `calc()` stopgap applies, marked `ponytail:`. **Deferred item:** swap to the tokens once they land.
- Choice box 16px and switch thumb 12px borrow `space-5`/`space-4`. Proposed: `--ocx-control-choice`.
- Option-row padding 7×10 and button gap 6: nearest are `space-3`/`space-4` and `space-2`+`space-1`.
- The sheet's highlight tint is 0.07; `accent-tint` is 0.10. Use the token.
- `--ocx-radius-full` says "status dot ONLY", but the sheet also uses it for the radio. Widen the comment.

## Behaviour

**Verdict: no library now. Select and Menu are native. Combobox stays vocabulary-only until the owner's headless-library decision.**

Owner constraint: **no hand-written widget state logic** (keyboard, ARIA state) until the headless-library decision is made. The only possible behaviour sources are the platform or a library.

| Widget | State machine needed? | Source |
| --- | --- | --- |
| Select | no | `<select>`; `base-select` gives the styled picker |
| Menu (links) | no | `popover` + `popovertarget` + `closeOnFocusOut` |
| Dialog | no | `<dialog>` + `showModal()` |
| Combobox | **yes** | library only (Zag candidate) |

**Owner decision (base-select residual).** Browsers without `appearance: base-select` (Firefox, Safari at time of writing) keep the OS picker under a matching closed box. There are two options:

- **(a)** Accept that. The e2e that asserts the picker look then runs on Chromium only.
- **(b)** Use `@zag-js/select`, about 30 kB gz, for the same look everywhere.

Contract default: (a).

Zag.js facts (checked 2026-09-27: npm; esbuild bundle of `machine` + `connect` + `@zag-js/vanilla`; context7 `/chakra-ui/zag`):

- **Size, min+gz:** combobox 31.2 kB, select 30.6 kB, menu 30.6 kB, dialog 18.2 kB. All three together: 44.2 kB (shared core, popper, `@floating-ui/dom`). `@zag-js/vanilla` alone: 5.6 kB.
- **Astro without a framework:** `@zag-js/vanilla` exports `VanillaMachine`, `normalizeProps`, `spreadProps` and `mergeProps`. A `<script>` spreads props onto existing DOM.
- **SSR / no-flicker:** `connect()` runs in Node without `start()`. For example, `select.getTriggerProps()` → `{id, role:"combobox", aria-expanded:false, data-state:"closed", data-part:"trigger", …}`. The frontmatter can render the initial attributes (drop the function props), so the first paint is final. `start()` needs `document`, so it is client-only.
- **a11y:** covers the APG combobox (list autocomplete, `aria-activedescendant`), the select-only combobox and the menu button (roving focus, type-ahead).
- **Maintenance:** MIT, 5.2k stars, pushed 2026-09-26. 1.44.0 shipped 2026-09-13, with 2–6 releases a month in 2026. 4 open issues. `2.0.0-next.3` is on the `next` tag: pin 1.x and budget a migration.
- Our stubs already use Zag's `data-part` / `data-state` / `data-highlighted` vocabulary.

## Consumers

| Component | Switch to | When |
| --- | --- | --- |
| DependencyExplorer search | Input (`type=search`, `hideLabel`) | WP14c |
| DependencyExplorer licence | Select (runtime options in the Select option markup) | WP14c |
| DependencyExplorer loading | Loader + Skeleton (a table-shaped reserve replaces `min-height: 100vh`) | WP14c |
| DependencyExplorer error / noscript | Starlight aside markup (danger) | WP14c |
| PlatformIcons chips | Tag `label` neutral | WP14c |
| Starlight `LinkButton` | Button heights and tokens (`starlight.css`) | WP14a |
| Header search trigger + Pagefind dialog input | Input tokens (`starlight.css`; not WP11b-owned) | WP14a |
| Terminal loading | Loader size s in the reserved box | defer: WP11b owns Terminal motion |
| ThemeSelect, header install, header tools | Button ghost/secondary s | defer: **WP11b owns** `Header.astro` |
| MobileMenuFooter | none | defer: **WP11b owns** it |
| Tooltip restyle | none, owner decision | defer: **WP11b owns** its motion |
| EcosystemMenu | stays bespoke; may adopt `.ocx-ui-overlay` | later |

**Code-page artifact** (owner report; root-caused on a separate branch):

- In production the page paints final. The artifact is dev-only: Vite re-optimises a dependency and blank-reloads on first open, and the dev HTML carries 441 KB of inline styles.
- Cleanup committed there: the italic font preload is dropped.
- **Handed to WP11b:**
  - The logo `<img>` pops in inside `Header.astro`: inline it as an SVG (under 2 KB).
  - Optional: preload Plex Mono 600.

## Sub-WP split (file-disjoint)

### WP14a: statics

Files:

- `ui/Button.astro`, `ui/Input.astro`, `ui/Choice.astro`, `ui/Tag.astro`, `ui/Loader.astro`, `ui/Skeleton.astro`, `ui/ids.mjs`
- `starlight/starlight.css`: `.sl-link-button`, the search trigger and the Pagefind input
- `scripts/pack-smoke.mjs`: resolve one `components/ui/*.astro` from the tarball

Tests:

- `packages/theme/test/ui-form.test.ts` (Button, Input, Choice). Includes an assertion that `@ocx-sh/theme/components/ui/Button.astro` resolves.
- `packages/theme/test/ui-status.test.ts` (Tag, Loader, Skeleton)
- `tests/e2e/ui-form.spec.ts`, `tests/e2e/ui-status.spec.ts`: axe, focus ring, reduced motion stops the spinner, no-JS hides the Loader, dark parity
- `tests/e2e/ui-consistency.spec.ts`: computed border-width, border-radius, font-family and block-size equal the token values. Covers Button m, Input, the Select control and the search input. WP14c extends it to the DependencyExplorer controls.

Showcase: `examples/starlight/src/content/docs/components/form.mdx`, `.../components/status.mdx`.

### WP14b: overlays, visual layer only

Files: `ui/Select.astro`, `ui/Combobox.astro` (vocabulary only), `ui/Menu.astro`, `ui/overlay.css`. No behaviour `.mjs`.

Tests:

- `packages/theme/test/ui-overlay.test.ts`: markup + ARIA
- `tests/e2e/ui-overlay.spec.ts`: the picker look on Chromium only (see the owner decision), Menu open/Esc/focus-out, two menus without collision, axe

Showcase: `.../components/overlays.mdx` (Select and Menu only; **no Combobox**).

### WP14c: consumers (after a and b)

Files: `DependencyExplorer.astro`, `dependency-explorer.mjs`, `PlatformIcons.astro`.

Tests: `packages/theme/test/components-dependency-explorer.test.ts`, `packages/theme/test/components-platform-icons.test.ts`, `tests/e2e/components-dependency-explorer.spec.ts`, `tests/e2e/components-platform-icons.spec.ts`, plus its extension of `tests/e2e/ui-consistency.spec.ts`.
