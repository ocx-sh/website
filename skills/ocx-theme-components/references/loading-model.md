# Loading model: lazy Zag, final first paint

You loaded this file because a component loads JavaScript too early, does not
react, shifts layout, or you are writing a component of your own on top of the
theme.

Contents: [Triggers](#triggers) · [Root attributes](#root-attributes) ·
[Every-page script](#every-page-script) · [Deferred content](#deferred-content) · [Writing your own](#writing-your-own)

## Triggers

Behaviour comes from Zag state machines. Each Zag-backed component has one
`*.zag.mjs` module, imported lazily; the page loads only a small trigger layer
before input.

| Trigger | Starts on | Used by |
|---|---|---|
| `interaction` (default) | First `pointerenter`, `focusin` or `touchstart` on the root; the first activating key is replayed | Every Zag component not listed below |
| `visible` | The root scrolling into view | `Toc`, and the `play` of `ShellSession` |
| `manual` | An explicit start | Search dialog, toaster, mobile menu toggle, and every `Deferred` (its own `idle`, `input` and `panel` triggers call the start) |
| eager | Page load | A `Dialog` or `Drawer` rendered with `open` |

Components without a machine render plain HTML and a small delegated script,
or no script at all: `Button`, `Link`, `Label`, `InputGroup`, `Meter`,
`ProgressCircle`, `Skeleton`, `Loader`, `Breadcrumbs`, `Sidebar`, `Kbd`, `Icon`,
`PlatformIcons`, `ToggleButton`, `CycleButton`, `Tree`, `Tooltip`, `Menu`
(native popover).

A `src` on `Popover` or `Hint` adds no module and no request of its own: the
fetch runs inside the machine's chunk, on the first open or show.

Because the server renders every part, a component is usable before its
machine starts: links navigate, native inputs submit, `Tabs` shows the
selected panel, `Toc` links jump.

## Root attributes

Useful when a test or a bug report needs the state of a machine:

| Attribute | Values |
|---|---|
| `data-zag-root` | Marks a Zag-backed root |
| `data-zag-trigger` | `interaction` (or absent), `visible`, `manual` |
| `data-zag-state` | `idle` → `loading` → `live`, or `error` |

A page with no input for two seconds after load must show every
interaction root `idle`. The theme's own e2e gate asserts exactly that; copy
the idea into a consumer gate (see `ocx-theme-quality`).

## Every-page script

In Starlight, the theme's `Search.astro` override carries one script that
also mounts the header nav menu, the sidebar collapsibles, the mobile menu
drawer, the toaster, and the delegated click listener of `CycleButton`.
The Pagefind results skin loads at the first dialog open. Overriding `Search` without calling `mountChrome(document)` (from
`@ocx-sh/theme/chrome`, which holds that script) loses all of them. Outside
Starlight, `CycleButton` needs `install()` from `@ocx-sh/theme/cycle-button`.

## Deferred content

`Deferred` fetches a `frag/` page at `idle` (the default: after the `load` event when the browser is idle, or the first input anywhere, whichever comes first), at the first input (`trigger="input"`: wheel, key, pointer move or press, touch or `focusin`), or when its Tabs panel is first shown (`trigger="panel"`; outside a panel it behaves as `idle`), adds its stylesheets (once each, and
waits for them), inserts its body, runs its scripts and dispatches a bubbling
`ocx:inserted` on the inserted content. A script or stylesheet from another origin is dropped, and a relative `src` resolves against the fragment. A module script the page already runs is
not run twice; a classic inline script runs again, so a strict CSP must allow it.
A page that moves focus by script at load (a Dialog rendered open) starts its `input` boxes at once. That is accepted.

Every component script therefore mounts its roots through `onRoots(selector, fn)`
(`ui/roots.mjs`): once for each match in the document, and again for each subtree an
`ocx:inserted` announces. Never scan `document` at the top of a component script, and
write a mount function of your own as a per-root function that is safe to call once
per element. `Tree` is the one exception: it listens for `ocx:inserted` itself, because its script
must import only `tree.mjs` to stay inlined in the page (a shared import makes it a request). Outside the theme, a consumer script can listen for `ocx:inserted` itself.

## Writing your own

- Build on the primitives (`Button`, `InputGroup`, `Select`) rather than
  restyling native elements.
- Render the final state on the server; let the client only react.
- A heavy dependency loads on first interaction via dynamic `import()`, never
  at the top of a page script.
- Reserve the box of anything that appears later.
- Zag imports stay in one `*.zag.mjs` module per component in the theme; a
  consumer site does not import `@zag-js/*` itself. Need a machine the theme
  lacks? Propose the component upstream in `ocx-sh/website`.
