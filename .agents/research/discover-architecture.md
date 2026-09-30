# Discover: architecture map (2026-09-27, architecture-explorer)

Key gaps vs HANDOVER + loaded rules (path:line against commit 0ac0fda):

- No `@layer` anywhere in packages/theme/src (CSS-CAS-02 unmet; HANDOVER:85 asks for it).
- No built-CSS gate scripts (outside-layers, literal-colours, dark-parity; css-theming gate.md:15-22). tokens.test.ts parses source, not the built artifact (CSS-GATE-01).
- Plugin (starlight/index.ts:38-53) sets only customCss, components.Header, expressiveCode. Missing vs HANDOVER:68: Footer override, pagefind.mergeIndex, base-path link fix.
- `@ocx-sh/theme/vitepress` export missing (HANDOVER:69).
- Package ships raw .ts/.astro (files: ["src"]), no .d.ts; typescript-packaging floor wants declarations where types ship; no pack-smoke / npm pack check; no CI (.github absent).
- engines.node ">=24" unbacked by any CI leg.
- base.css prose `:is()` list (base.css:115-167) still names `.md-typeset` (MkDocs) — dropped generator.
- starlight.css depends on undocumented Starlight internals (.sl-link-button, .sidebar-content, starlight-toc, starlight-tabs, .starlight-aside*, .sl-badge) with only a `>=0.42.0` peer floor.

Reusable: activeSection() (nav.ts:9-20); the single prose :is() list; plugin config:setup pattern; nav.json as path registry; convert.ts (ponytail interim).
