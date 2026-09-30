# Discussion: ocx theme framework with Zag-backed components

State: handed-off → loop · Updated: 2026-09-27
Participants: owner (Michael Herwig) and Claude, session of 2026-09-27 on branch `hex/website-buildout`
Ratified: 2026-09-27 → loop

## Intent

Owner, 2026-09-27: "We want a framework for all that has previously been
stated, adoptable like an npm package users can use, and now good support of
components with the interoperability of Zag." Build a solid system first:
`@ocx-sh/theme` (Astro + Starlight plugin, tokens, components) that every ocx
docs repo installs with one plugin line, with one coherent component system.

Out of scope: every consumer repo (no docs move, no edits); Stage B of
`.agents/plans/plan_website-buildout.md` (Bunny, deploy action, CI/release,
lore publish, root site), which stays gated on owner gate G1; npm publish and
any live hosting step.

## Requirements

- Stage A done: WP11b and WP14 merged; task check, e2e, lighthouse and pack green.
- Zag Tier A machines plus search, sidebar and mobile menu adopted per the research.
- Zag supplies only behaviour: our API, markup and token CSS stay; first paint is final, no flicker.
- task dev has a clickable showcase page per component, like Zag's examples, covering every state; a test fails on a missing one.
- Memory-optimized: JS heap and DOM size are budgeted and enforced in the gate.
- Performance-optimized: page weight and JS budgets enforced; Lighthouse 100 x4 on every example page.
- The packed tarball installs into a fresh consumer fixture and renders every exported component.
- Components follow the live OCX design project; gaps are design questions in the PR.

## Decisions

- Keep Starlight as the framework underneath (data, routing, content, search index). Every visible and interactive part is ours, via Starlight component overrides, with behaviour from Zag. Full Starlight replacement was considered and rejected: Expressive Code and the consumers' Starlight plugins (`starlight-pydocs`) stay either way.
- Native elements where the browser covers it (button, input, checkbox, loader). Zag wherever it has a machine. Own logic only where Zag has none (terminal player, file tree, TOC scroll-spy, dependency explorer internals).
- Two tiers for the Zag catalogue: Tier A = needed now or likely soon ("having them ready makes them get used"); Tier B = very unlikely or too much work now.
- Toast on every copy action, naming what was copied. Switch available alongside checkbox.
- Our design is not set in stone: where Zag's interaction model differs, adopt Zag's model unless a recorded reason says otherwise.
- Pin Zag 1.44.x exactly and keep all Zag glue in one helper (Zag 2.0 is in pre-release).
- Assets never cause flicker or a broken look (AGENTS.md › Working here).
- Hotkeys stay as today; Starlight's Ctrl+K keeps a single owner.

## Research

- `.agents/research/zag-adoption.md` — component map, Tier A list (20 of 50 machines), sizes, SSR story, risks, 8-WP batching.
- `.agents/research/ui-primitives.md` — WP14 inventory of UI divergences (lands with WP14).
- `.agents/research/ocx-components-port.md` — the WP13 port of the ocx VitePress components and their refinement history.

## Related

- `.agents/plans/plan_website-buildout.md` — the active plan (Stage A, gate G1, Stage B).
- `.agents/adr/adr_0001_ocx-site-architecture.md`, `.agents/adr/design_ocx-site.md`.
- `HANDOVER.md`, `AGENTS.md`.
- Live design project: https://claude.ai/design/p/550606f7-5b74-4164-b5e9-6a2e5b27cafe (local export in `.tmp/design/`).

## Open questions

- [NEEDS CLARIFICATION: header — Zag navigation-menu (opens on hover and click, sliding section indicator, arrow keys in the rail) or keep the click-only ecosystem popover?] Recommended: Zag navigation-menu — the owner prefers Zag's model where it differs, and it closes the header's keyboard gaps.
- [NEEDS CLARIFICATION: size budget — about 20 kB JS per docs page, 19.6 kB of it the header, loaded on first hover or focus?] Recommended: accept, enforced by the new budget gate, as long as Lighthouse stays 100×4.
- [NEEDS CLARIFICATION: code-token colour for variables and keys — coral (current) or purple (design)?] Recommended: coral — purple leaves shell and PowerShell blocks with two colours.

## Verification

`ocx exec -- task check`, plus `task e2e`, `task lighthouse` and `task pack` (AGENTS.md › Commands).
