# Zag framework gates: API, SSR, showcase shape, measurement

Checked 2026-09-27. Builds on `.agents/research/zag-adoption.md` — not repeated here.

## 1. `@zag-js/vanilla` 1.44.0 (latest 1.44.x; no `1.44.1+` exists — next train is `2.0.0-next.3`)

Verified in Node against the real `dist/machine.mjs` and `dist/spread-props.mjs`.

- `VanillaMachine(machineDef, userProps)`. Methods: `start()`, `stop()`, `send`,
  `subscribe(fn)`, `updateProps(fn)`. **No `destroy()`** — `stop()` is the full teardown.
- `subscribe(fn)` returns an **unsubscribe function** (pushes to `this.subscriptions`,
  returns a closure that splices it back out).
- `normalizeProps` + connect's `get*Props()` return plain attribute objects (not a
  `props()` factory — that changed from older docs/blog posts you may find online;
  the top-level `dialog.props` export in 1.44 is just the array of prop *keys*, used
  internally by `splitProps`, not a callable).
- `spreadProps(node, attrs, machineId?)` **does return a cleanup function**: it
  removes every `on*` listener it attached and clears its internal `WeakMap` entry
  for that node/machine. Call it when a spread node is removed from the DOM.
- **Full teardown sequence** to avoid leaks (view-transition swap, manual removal,
  Astro island unmount):
  1. Call the unsubscribe fn returned by your own `subscribe()`.
  2. Call every `cleanup()` fn returned by `spreadProps()` for nodes you spread.
  3. Call `machine.stop()`. Verified in source: `stop()` runs every registered
     **effect cleanup** (`this.effects` — this is where dismissable-layer listeners,
     focus-trap teardown, and outside-click/escape handlers registered by
     `states[x].effects` live), clears the effects map, runs the machine's exit
     actions, unsubscribes internal cleanups, and clears `subscriptions`.
  4. `stop()` does **not** touch nodes you spread onto — step 2 is still required,
     and it does not null out DOM refs — drop your own references so the nodes GC.
  - Order matters: call `stop()` **before** removing the DOM subtree, so exit
    effects (e.g. focus restoration to `finalFocusEl`) still have live nodes to act on.

Source: `node_modules/@zag-js/vanilla/dist/machine.mjs`, `dist/spread-props.mjs` (read
directly, version 1.44.0, matches npm `latest`).

## 2. SSR closed-state, verified in Node (unstarted `VanillaMachine`, no `.start()`)

Confirmed for **dialog**, **accordion**, **navigation-menu** by constructing the
machine and calling `connect()` without starting it:

- **dialog**: content `hidden:true`, `data-state:"closed"`, `aria-expanded:false` on
  trigger, `aria-modal:true` stays present (static). Backdrop and positioner also
  carry `hidden:true` / `data-state:"closed"`. No stray attributes.
- **accordion**: item-trigger `aria-expanded:false`, `data-state:"closed"`; item-content
  `hidden:true`, `data-state:"closed"`, `role:"region"`. No stray attributes.
- **navigation-menu**: trigger `aria-expanded:false`, `data-state:"closed"`; content
  `hidden:true`, `data-state:"closed"`; viewport `hidden:true`, `data-state:"closed"`.
  No stray attributes.
- **toast, combobox, select**: not run in Node this pass (no trivial single-item
  `connect()` call — toast needs a store/group API, combobox/select need a
  `collection`). By the same machine-authoring convention (state-derived attrs,
  no DOM refs read at connect time) they should match, but treat as **unverified**
  until each wrapper's Container-API test asserts it directly, per WP's own test
  strategy.
- **`@zag-js/drawer` exists at 1.44.0** (`npm view @zag-js/drawer version` → `1.44.0`,
  installed and importable). Confirms adoption note §5's drawer row.
- Known stray attribute from the adoption note stands: **tabs** SSR emits
  `data-focus` on the selected trigger; strip it. Dialog/accordion/navigation-menu
  emit no such attribute in 1.44.0 — this quirk looks tabs-specific, not universal.

## 3. Zag's own example/demo pages: thinner than assumed — do not over-spec ours

- zagjs.com component pages (checked `/components/dialog`): header, sidebar nav,
  title + "Copy Page"/"View as MDX" actions, feature bullets, **one live demo
  region**, then framework-tabbed usage snippets (React/Solid/Vue/Svelte — **no
  vanilla tab** in the docs snippets), API reference (methods/props/data
  attributes/CSS vars), accessibility/keyboard table, on-this-page index.
  **There is no interactive props-toggle "controls panel" and no state
  visualizer on the docs site itself.**
- The state visualizer that exists is a separate third-party project,
  `anubra266/zag-visualizer` (zag-visualizer.vercel.app) — not part of zagjs.com
  and not part of the demo pages.
- `github.com/chakra-ui/zag/examples/` has `next-ts`, `nuxt-ts`, `preact-ts`,
  `solid-ts`, `svelte-ts`, `vanilla-ts`, plus `shared/styles` (CSS only). Each
  component's demo files (e.g. `next-ts/pages/dialog/basic.tsx`) are minimal,
  single-purpose snippets — a machine, a render, no controls/toolbar/visualizer
  component. `[component].tsx` is just an index/search page listing example
  links per component, driven by `@zag-js/shared`'s `componentRoutesData`.
- **Spec implication**: our showcase pages (one per component, states covered)
  should follow AGENTS.md's own bar — every state rendered as a static section,
  not a live props-toggle UI. Building a Zag-style "controls panel + state
  visualizer" would be *more* than upstream ships; skip it unless the owner asks.

Source: `https://zagjs.com/components/dialog` (fetched), `github.com/chakra-ui/zag`
`examples/next-ts/pages/dialog/basic.tsx` and `examples/next-ts/pages/[component].tsx`
(raw content read directly).

## 4. Memory/perf measurement

- **CDP metrics**: `const client = await page.context().newCDPSession(page)`, then
  `client.send('Performance.enable')`, `client.send('Performance.getMetrics')` →
  array of `{name, value}` incl. `JSHeapUsedSize`, `Nodes`, `JSEventListeners`,
  `Documents`, `Frames`, `LayoutObjects`. Chromium-only (Playwright CDP sessions
  don't exist on Firefox/WebKit) — gate this test to the Chromium project.
- **`performance.measureUserAgentSpecificMemory()`**: spec-restricted to
  cross-origin-isolated contexts (`self.crossOriginIsolated === true`), which
  needs both `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` response headers. **Feasible on a
  static preview server** if you add those two headers to the preview server's
  response (e.g. a small middleware in front of `astro preview`/whatever serves
  the built site for e2e) — but COEP `require-corp` then requires every
  cross-origin subresource (fonts, embeds) to also carry CORP/CORS, which can
  break unrelated assets. Prefer CDP `Performance.getMetrics` for the leak test;
  reach for `measureUserAgentSpecificMemory` only if CDP proves insufficient.
- **`HeapProfiler.collectGarbage`**: also a CDP domain method
  (`client.send('HeapProfiler.enable')` then `client.send('HeapProfiler.collectGarbage')`)
  — call it right before each `Performance.getMetrics` read to force a GC pass
  for stable heap numbers between samples.
- **Leak test pattern**: mount/destroy (or open/close) N times (N≈20–50), forcing
  GC + sampling `JSHeapUsedSize`/`Nodes`/`JSEventListeners` every K cycles;
  assert the last sample is within tolerance (e.g. ±10–15%) of an early
  post-warmup baseline (skip the first few cycles — JIT/caches settle). A
  monotonic upward trend across samples, not just the raw delta, is the signal
  that catches a real leak vs. noise.
- **lhci 0.15**: assertions live under `assert.assertions` in `lighthouserc.js`/json,
  keyed `"<audit-id>": ["error"|"warn", {maxNumericValue: N}]` or `["error", {minScore: N}]`.
  `resource-summary:<type>:size|count` (e.g. `resource-summary:script:size`) and
  `total-byte-weight`, `dom-size` are all valid audit ids for `assertMatrix`/`assert`.
  **lhci 0.15 will not let you combine `budgets.json` with `assert.assertions`** —
  pick one mechanism. Given the per-page numeric limits already in the adoption
  note (§3, §6), use `assert.assertions` directly rather than a separate
  `budgets.json`, so both the byte budget and the Lighthouse category-100 gate
  live in one config block.

Sources: Playwright `CDPSession` docs (`playwright.dev/docs/api/class-cdpsession`),
web.dev `why-coop-coep` / `coop-coep` articles, GoogleChrome/lighthouse-ci
`docs/configuration.md` and issue #202 (byte vs. kilobyte units).

## 5. Lazy hydration + view-transition cleanup

- **Pattern** (no framework): `IntersectionObserver` for "visible" triggers
  (`{ rootMargin: "200px" }`, disconnect after first fire); `{ once: true }`
  listeners on `pointerenter`/`focusin` for "first interaction" triggers,
  matching the adoption note's `mount(root, machine, connect, render)` helper
  (§3 there) — that helper is the right place to centralize this, not per
  component.
- **Starlight 0.42 does not use view transitions by default.** `<ClientRouter />`
  is an opt-in Astro component Starlight does **not** insert on its own; adding
  it requires overriding Starlight's `<Head>` component (third-party guides
  exist for exactly this because it's not stock behavior). Confirms your prior
  belief — **no `astro:before-swap` cleanup path is needed unless/until a future
  WP explicitly opts Starlight into `<ClientRouter />`.**
- If that ever changes: `astro:before-swap` fires before the incoming document
  replaces the current one; a listener there is where `machine.stop()` +
  `spreadProps` cleanups would need to run for any hydrated Zag instance not
  marked `transition:persist`, since `ClientRouter`'s swap replaces `document.body`
  wholesale except persisted nodes.

Sources: Astro `view-transitions` guide, `astro-transitions` module reference,
third-party "Guide: `<ClientRouter />` View Transitions for Starlight" (confirms
it's manual work, not default).
