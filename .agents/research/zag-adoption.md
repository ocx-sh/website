# Zag.js adoption: pre-analysis

Checked on 2026-09-27 against `@zag-js/*` 1.44.0 (npm). Sizes come from an esbuild ESM bundle of
`@zag-js/vanilla` plus the machine's `machine` and `connect`, min+gz. The shared runtime
(`VanillaMachine`, `normalizeProps`, `spreadProps`) is **6.3 kB** of every figure below.
Our current behaviour modules, for comparison: tooltip 0.8 kB, terminal 0.9 kB,
dependency-explorer 1.8 kB, tab-icons 0.8 kB. The earlier notes in WP14
(`wp14-a/.agents/research/ui-primitives.md › Behaviour`) agree with these numbers.

**Verdict: adopt Zag, in tiers.** It is the right source for every widget that needs
a real state machine: tabs, combobox, menus, dialogs, toast, navigation menu and tree.
Four components should keep their own behaviour, because the platform already does
the job at a fraction of the size, or because Zag's interaction model is a regression
for them. These are the inline Tooltip, the docs file Tree, FeatureSection and the
Terminal player. Starlight's own chrome (search, sidebar, TOC, pager, mobile pane)
stays Starlight's.

## 1. Component map

| Component | Today | Target | Zag adds | Loses or regresses | Parity tests |
|---|---|---|---|---|---|
| Header section nav | links + `aria-current` | `navigation-menu` (see §1b) | arrow keys between triggers, indicator, hover intent | on every page: ~0 → 19.6 kB (nav-menu + tabs) | `header.test.ts`, `header.spec.ts` rewritten |
| EcosystemMenu | Popover API + radio rail + CSS `:has` + `closeOnFocusOut` | `navigation-menu` content + vertical `tabs` rail | real tablist semantics for the rail (a radio group in a nav is odd), focus return | top-layer light dismiss is replaced by Zag `dismissable`; the menu gains hover-open | `header.spec.ts` rewritten |
| ThemeSelect | `<button aria-pressed>` | **native** (no change) | — | — | unchanged |
| Mobile menu (Starlight pane + MobileMenuFooter) | Starlight `starlight-menu-button` | **Starlight-owned** | a Zag `drawer` would be possible through the MobileMenuToggle override | 27.6 kB and a re-test of Starlight's scroll lock; not worth it | unchanged |
| Tooltip (inline term) | `popover=manual` + CSS anchor, 0.8 kB | **keep ours** | APG tooltip | Zag tooltip does not open on tap, has non-interactive content (links inside ours are allowed) and positions with floating-ui: 21 kB, 26× ours | unchanged |
| Tooltip (icon-button hints, new) | `title` / `aria-label` | `tooltip` | consistent hint for icon buttons | — | new |
| Terminal collapse | button `aria-expanded` + `hidden` | `collapsible` | `--height` var for the open animation, `data-state` | +3.2 kB over the runtime | `components-terminal.*`: keep the ARIA assertions; Zag uses the same `aria-expanded` + `hidden` |
| Terminal player | asciinema + lazy load | **own logic** | no machine fits; `@zag-js/core` could model it (§4) but gains nothing | — | unchanged |
| Tree / TreeNode | `<details>` + click select | **keep native** | `tree-view` = APG `role=tree` with roving focus | a static illustration would become an interactive widget; slot-authored nodes would have to be re-read into a JS collection | unchanged |
| PlatformIcons | `role=img` + `title` | **native** | — | — | unchanged |
| DependencyExplorer search | native `<input>` | **native** (WP14 Input) | — | — | unchanged |
| DependencyExplorer licence | native `<select>` | `select` (owner option b), else native `base-select` | the same picker in every browser | 31 kB vs 0 | new e2e |
| DependencyExplorer row expand | `aria-expanded` toggles | `collapsible` (shared with Terminal) | `data-state`, animation var | — | the `aria-expanded` assertions carry over |
| DependencyExplorer loader | `role=status` spinner | **native** (WP14 Loader/Skeleton; `<progress>` if it ever shows a determinate value) | `progress` only emits ARIA values | 8 kB for attributes | unchanged |
| FeatureSection reveal | IntersectionObserver | **own logic** | — | — | unchanged |
| Code copy button | Expressive Code's own | EC copy + a `toast` ("Copied `ocx install …`") | copy feedback that names what was copied (catalog parity) | EC's button stays; a delegated listener feeds the toast | new |
| Shell Tabs | Starlight `<Tabs>` + `decorateTabs` HTML rewrite | our `Tabs.astro` on `tabs` (§2) | indicator var, vertical orientation, the icon as a prop instead of an HTML tokenizer | markup changes from `<a role=tab>` to `<button>` | `code-tabs.test.ts`, `tables-tabs.spec.ts` rewritten; the behaviours they assert are kept |
| Table scroll region | SSR wrap, `tabindex=0` | **native** | — | — | unchanged |
| Search, sidebar, TOC highlight, pager | Starlight | **Starlight-owned** | Zag `dialog` and `toc` exist, but replacing them means overriding Search/TOC and re-owning Pagefind UI | risk with no user-visible gain | unchanged |
| WP14 Select / Menu / Combobox | native / popover / vocabulary-only | Combobox → `combobox`; Menu (links) → **native disclosure** (APG: `role=menu` is wrong for nav links); action and context menus → `menu` | behaviour for the stub that WP14b left open | — | the `ui-overlay` tests stay, Combobox gains an e2e |

### 1b. Where Zag's model differs from ours (owner: do not force ours)

| Case | Current model | Zag model | Recommended | What the owner would see change |
|---|---|---|---|---|
| Header + Ecosystem | Click-only popover. nav.json sections: docs and catalog are links, ecosystem is one button. Inside it, a radio rail (hubs) and a preview strip | `navigation-menu`: List › Item › Trigger/Content, plus a shared Viewport. Opens on hover (200 ms) and on click, arrow keys move between triggers, animated indicator, Esc and outside click close it | **Adapt.** docs and catalog become `Link` items, ecosystem becomes an Item with Content = the mega panel, and the rail becomes a vertical Zag `tabs` with automatic activation (the strip keeps its CSS `:has` preview). The viewport pattern gives a size-animated panel if more sections gain menus later | Ecosystem opens on hover as well as click. An indicator slides under the active section. The rail becomes arrow-key navigable. The panel moves out of the top layer, so z-index against Starlight's header must be managed |
| Header: harder parts | — | — | Zag has no nested sub-menus in 1.x, so the rail is `tabs`, not a submenu. Content is not a Popover API layer (no top layer, no free light dismiss). Hover-open needs `closeDelay` tuning against the strip. The machine plus tabs costs 19.6 kB on **every** page, loaded lazily on first pointerenter/focusin so the header SSR is final | — | — |
| Menus | WP14 Menu = links in a popover (disclosure) | `menu`: `role=menu`, roving focus, type-ahead, context-menu mode | Nav links: **keep the disclosure** (APG forbids `role=menu` for site navigation; Zag's own docs route those to navigation-menu). Actions (catalog copy menu, right-click on a tag): **adopt `menu`** incl. context mode | Nothing changes for nav. Copy actions gain type-ahead and right-click |
| Mobile menu | Starlight pane + our sections footer | `drawer` / `dialog` | **Keep Starlight's.** The sidebar lives in Starlight's pane; a Zag drawer would duplicate it | none |
| Tabs | Starlight `<a role=tab>`, syncKey | `tabs` with `<button>` triggers and `value`/`onValueChange` | **Adapt** (§2) | the same look; the icon moves into markup |
| Tooltip | focus/hover/tap, interactive popup, CSS anchor | hover/focus only, non-interactive, floating-ui | **Keep ours** for terms (mobile tap and links inside are requirements). Use Zag only for icon-button hints | none for terms |

## 2. Tabs

- **Authoring.** `@ocx-sh/theme/components/Tabs.astro` + `TabItem.astro`, with the same props as
  Starlight (`syncKey`; `label`, `icon` on TabItem). Starlight user components cannot
  be overridden, so the import path changes. The converter (`scripts/samples/convert.ts:27,180,222`)
  moves `Tabs`/`TabItem` out of `STARLIGHT` and emits our import. `<Tabs syncKey="shell">`
  stays byte-identical. Starlight's own components do not use `<Tabs>` (it is only
  exported via `components.ts`), so nothing else is affected.
- **Panels.** TabItem renders `<div data-ocx-tab data-label …>` and Tabs collects the
  labels from the rendered slot (the same slot-rewrite approach as `Tree.astro`;
  Starlight does this with a rehype processor). Expressive Code inside a panel is plain
  HTML, so it works unchanged. Keep `splitStylesheets` (the EC `<link>` hoist is still
  needed). `decorateTabs` (the HTML tokenizer) is **deleted**, because the icon becomes a prop.
- **SSR, no flicker.** Verified in Node: `tabs.connect()` on an unstarted `VanillaMachine`
  returns the complete attribute set: `role`, `aria-selected`, `tabindex`, `aria-controls`,
  `hidden` on inactive panels, and `data-*`. The frontmatter renders these (with function
  props dropped), so the first paint is final. One quirk: SSR emits `data-focus` on the
  selected trigger, which must be stripped.
- **syncKey.** Zag has no sync. Copy Starlight's approach:
  1. One `is:inline` restore script per page. A custom element right after each synced
     group reads `localStorage["starlight-synced-tabs__<key>"]` (the same key, so existing
     readers' choice survives) and rewrites the SSR attributes before paint.
  2. The machine then starts with `defaultValue` read from the DOM. `onValueChange`
     writes storage and `send`s to every other group with the same key on the page.
  3. Scroll-anchor the clicked tab, as Starlight does.

## 3. Integration mechanics (Astro, no UI framework)

- **Official vanilla adapter:** `@zag-js/vanilla` (MIT, same version train) exports
  `VanillaMachine`, `normalizeProps`, `spreadProps(node, attrs)` and `mergeProps`. There were
  12 releases from April to September 2026, cut every 2–6 weeks. **`2.0.0-next.3` is on `next`**
  (`gridlist`, `menubar`, `meter` and `toolbar` exist only there). Pin `1.44.x` exactly.
- **One helper, `ui/zag.mjs`.** It provides:
  - `ssrAttrs(props)` for the frontmatter: drops functions and maps booleans.
  - `mount(root, machine, connect, render)` for the client: starts the machine on first
    `pointerenter`/`focusin`, or at idle for tabs, and re-spreads on `subscribe`.
  - An events bridge: Zag callbacks become `CustomEvent('ocx:<scope>:<event>', {detail})`
    dispatched on the root, because Astro cannot pass functions from SSR to the client.
- **Scripts.** One `<script>` per component, bundled by Vite. The shared runtime ends up
  in one chunk. Overlays (menu, popover, select, combobox, tooltip, hover-card) all pull
  `@zag-js/popper`/floating-ui: 21–31 kB each, versus 0 for Popover API + CSS anchor.
  Its inline position styles conflict with our `position-area` CSS, and the popper
  cannot be tree-shaken out, so pick one positioning model per overlay.
- **Page cost.** A typical docs page (tabs + collapsible + clipboard + toast) is 20.1 kB.
  The whole Tier A set on one page would be 94.8 kB, but no page uses it all.

## 4. Custom machines

`@zag-js/core` exports `createMachine`/`setup` and `VanillaMachine` runs any machine.
That authoring API is internal-grade: it is undocumented as public API and it changes
in 2.0. **Do not author our own machines.** Terminal collapse = `collapsible`; the player
stays plain code (asciinema owns its state); the loader stays native.

## 5. Catalogue triage (50 machines at 1.44.0)

Tier **A** = adopt now (needed now or plausibly soon). Tier **B** = skip for now.
The size column is runtime + machine, min+gz, in kB. Consumers: **T** = this theme,
**D** = ocx docs, **C** = catalog (`ocx-catalog`, Reka UI today), **R** = root site.

| Machine | What | Needed by | Tier | Size |
|---|---|---|---|---|
| tabs | tab set | T D R (install per OS) | A | 11.3 |
| collapsible | disclosure | T (Terminal, deps rows) C (VersionTree) | A | 9.5 |
| accordion | grouped disclosures | R (FAQ), D | A | 8.7 |
| clipboard | copy + state | T (EC copy), C (every copy action), R (install) | A | 8.4 |
| toast | transient notices | C (hand-rolled `useToast`), T (copy feedback) | A | 13.4 |
| combobox | autocomplete input | T (WP14, deps licence) C (filter "+N" search) | A | 31.8 |
| select | custom picker | C (sort `SelectRoot`), T (owner option b) | A | 31.2 |
| checkbox | checkbox | C (filters) D forms | A | 10.5 |
| switch | on/off toggle | owner-named; C (settings/view prefs) | A | 10.5 |
| toggle-group | segmented control | C (cards/table view, index scope) | A | 9.3 |
| menu | action/context menu | C (`CopyContextMenu`, ContextMenu ×5) | A | 31.2 |
| popover | anchored panel | C (Popover ×4) | A | 29.4 |
| dialog | modal | C (SearchModal), R | A | 18.8 |
| drawer | edge sheet | C (DocsMobileNav), R mobile header (outside Starlight) | A | 27.6 |
| navigation-menu | site nav | T (Header/Ecosystem) R C (SiteHeader) | A | 16.6 |
| tooltip | hint | T (icon buttons only; the term Tooltip stays ours) C | A | 21.0 |
| tree-view | APG tree | C (VersionTree); the docs Tree stays native | A | 16.6 |
| toc | scroll-spy TOC | C (OnThisPage); Starlight keeps its own | A | 9.3 |
| radio-group | radios | forms; the WP14 Choice primitive | A | 11.3 |
| pagination | pager control | C table view (instead of endless slices) | A | 8.5 |
| hover-card | pointer preview | C (package preview) | B: pointer-only by design, weak a11y | 22.7 |
| progress | progress ARIA | T loader | B: native `<progress>` | 8.3 |
| toggle | pressed button | T theme toggle | B: native `aria-pressed` | 7.0 |
| scroll-area | custom scrollbar | T tables | B: native overflow | 12.4 |
| listbox | standalone listbox | — | B: combobox covers it | 16.4 |
| async-list | async load/filter/sort state | C | B, see §5a | 7.6 |
| steps | wizard steps | D (Starlight `<Steps>` is a static list) | B | 8.3 |
| tags-input | tag editor | nobody | B | 16.1 |
| qr-code | QR render | R (install on phone), speculative | B | 12.4 |
| carousel, marquee, avatar | showcase UI | nobody | B | 14.7 / 8.8 / 7.7 |
| tour | onboarding tour | nobody | B | 29.7 |
| number-input, pin-input, password-input, editable, rating-group, slider, angle-slider | form controls | nobody (docs have no forms) | B | 16.0 / 11.0 / 7.7 / 11.5 / 9.8 / 14.5 / 10.3 |
| date-picker, date-input, timer | time | nobody | B | 41.0 / 22.3 / 9.1 |
| color-picker, image-cropper, signature-pad, file-upload | media and input | nobody | B | 34.5 / 17.2 / 12.0 / 13.6 |
| cascade-select, splitter, floating-panel | app UI | nobody | B | 33.3 / 16.1 / 15.1 |
| gridlist, menubar, meter, toolbar | 2.0-next only | C grid keys (gridlist) | B until 2.0 | — |

**Props surface: typed, serialisable passthrough, not curated.**
- Each wrapper takes first-class props only where they shape markup (`value`, `label`,
  `items`, `orientation`).
- Each also takes one `zag` prop, typed as the machine's own `Props` minus functions and
  ids. The frontmatter and the client script both hand it to the machine verbatim, so
  the whole JSON-able API is available and the types track Zag with no upkeep on our side.
- Callbacks cannot cross SSR in Astro, so they arrive as `ocx:*` DOM events.
- Hand-curating ~20 wrappers × dozens of props would be the real maintenance cost,
  and every 2.0 migration would multiply it.

**Adopt-all vs tiered: tiered.** Tier A (20 machines) covers every consumer visible in
theme, docs, catalog and root. Tier B wrappers would have no consumer, and each would
still need CSS, a showcase, tests and a 2.0 migration.

### 5a. async-list for the catalog

Findings from the catalog:
- It loads a single `catalog.json` (125 packages today, bounded to ~5000) and filters
  it in memory.
- `useWindowedList` already builds only a growing 48-item slice, and cards use
  `content-visibility`.
- Filtering measures 1.5 ms at 1000 packages (the `CatalogPage.vue:177` note).
- The real hotspot is component **construction**: every card wraps a
  `CopyContextMenu`, which is 4 Reka components plus a computed list of 7 actions.
  Measured: 1.7–2.2 s to switch grid↔table at 252 packages with 4× CPU throttle
  (`useWindowedList.ts`). The second cost is the chip FLIP's forced layout.

`async-list` is a load/cursor/filter/sort state holder around an async `load()`. It
would wrap the same in-memory `filterPackages` and fix none of this. It has no
virtualization (Zag's `virtualizer` is a utility, not a machine). **Fix instead:**
1. **One** delegated context `menu` for the whole grid, filled from the target card's
   `data-*` on `contextmenu`. The card becomes a plain presentational
   `<a class=card data-pkg=…>` with no per-card menu component.
2. `pagination` or the existing slice for the table view.
3. Drop the chip FLIP.

async-list only makes sense if the catalog moves to server-side paging (a paged JSON index).

### 5b. Hotkeys

| Shortcut | Where |
|---|---|
| Ctrl/⌘ K | Starlight `Search.astro` (a global listener in its own script); catalog `useCommandPalette` |
| `/` focus search | catalog (`useCommandPalette`, `CatalogPage` on the index); not in Starlight |
| Esc, arrow keys | per widget (our tooltip, Starlight tabs, catalog grid and table roving, SearchModal): these are widget keys, which the machines already own |

**Do not unify on `@zag-js/hotkeys` now (7.4 kB).** There are only two global shortcuts.
Re-binding Ctrl+K would double-fire against Starlight's listener unless we override
`Search.astro`. Add `/` → search as a three-line listener that calls the same open
button. Revisit hotkeys when the root site or catalog gets a shortcut help sheet or a
command palette.

## 6. Risks, order, tests, effort

**Risks**
1. **Weight against "native first".** Overlays cost 21–31 kB each where the Popover API
   and CSS anchor cost ~1 kB, and the header adds 19.6 kB on every page. Lighthouse 100
   stays reachable (lazy start, no TBT), but the budget rule must be restated.
2. **Zag 2.0 is on `next`.** Every wrapper migrates soon. Pin 1.44.x, keep wrappers thin
   (typed passthrough), and put all Zag coupling in `ui/zag.mjs`.
3. **Visible model changes plus test churn.** Hover-open header, button tabs and a new
   tabs markup mean the tabs and header tests get rewritten, not re-run. The SSR
   first-paint contract needs its own e2e per wrapper (screenshot before hydration equals
   after), and WP14b's Select/Menu/Combobox overlap Z3/Z4.

**Test strategy.**
- Components that keep their behaviour keep their tests unchanged: WP13 tooltip, tree,
  platform icons, feature section, terminal ARIA.
- Rewritten suites keep every *behaviour* assertion and change only the selectors.
- Each wrapper gets:
  - Container API tests: SSR attrs equal `connect()` output.
  - axe checks.
  - A keyboard e2e following the APG pattern.
  - A no-JS/pre-hydration screenshot.

**WPs for an unattended hex loop** (file-disjoint; each = wrapper + token CSS + showcase + Container/axe tests + keyboard e2e):

| WP | Scope | After | Size |
|---|---|---|---|
| Z0 | `@zag-js/vanilla` pin, `ui/zag.mjs` (ssrAttrs, mount, events bridge), test helpers, budget note | WP14a | M |
| Z1 | collapsible + accordion; migrate Terminal collapse and deps rows | Z0 | M |
| Z2 | tabs + toggle-group; Tabs/TabItem, syncKey restore, converter, delete `decorateTabs` | Z0 | M |
| Z3 | checkbox, switch, radio-group, select, combobox (WP14b stub → live), deps licence | Z0, WP14b | L |
| Z4 | popover, menu (incl. context), dialog, drawer, tooltip (icon hints) | Z0, WP14b | L |
| Z5 | clipboard + toast, EC copy hook | Z0 | S |
| Z6 | navigation-menu header + tabs rail (EcosystemMenu), **owner visual review** | Z2, Z4 | L |
| Z7 | tree-view, toc, pagination (catalog-facing showcases) | Z0 | M |

Order, lowest risk first: Z0 → Z5, Z1 → Z2 → Z3/Z4/Z7 → Z6. **Precondition:** land WP14a
now, and fold WP14b's Combobox/Select/Menu behaviour into Z3/Z4 rather than finishing
it separately.
