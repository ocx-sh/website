# Discover: running theme vs design mocks (2026-09-27)

Screenshots: `.tmp/visual/` (mock-*.png, comp-c-*.png, site-*-{light,dark}-{desktop,mobile}.png);
scripts `.tmp/visual/shoot.mjs`, `shoot2.mjs` (playwright-core, mock ids via el.screenshot, dark via
localStorage 'starlight-theme'). Mocks served with `python3 -m http.server --directory .tmp/design`.

## Explorer findings
- No breadcrumb/eyebrow above H1 (`.ocx-eyebrow` styled in base.css, never rendered) → PageTitle override.
- No footer (mock: github · discord · roadmap · changelog · security + Apache-2.0 · © line) → Footer override.
- Mobile 390px: `.ocx-header__menu` force-hidden (starlight.css:95), Starlight's default menu button unstyled, header icons crowd/clip.
- Header uses @media, mock specifies @container 960/640.
- Mobile drawer theme switcher is Starlight's "Auto ▾" select, not the icon toggle.
- Ecosystem mega-menu not built (deferred).
- No landing/hub/404/bazel-ref templates exist (3a/3b/3c, 2a/2b, 1d, 1f).

## Orchestrator correction (own comparison of mock-1b vs site-install-top.png)
The explorer's "everything else matches closely" is wrong. Visible deviations:
- **Sidebar**: mock = mono-caps group labels, flat item list, active item tinted bg + coral text, no chevrons,
  no nested indent rules. Site = Starlight collapsible groups with chevrons, nested left borders, sample groups nested.
- **Code frames**: mock = plain panel, tab strip for code-groups (Shell · PowerShell · …), copy icon, readable size.
  Site = Expressive Code terminal frames (traffic-light dots, centred title), tiny code font, one frame per shell.
  → EC frame style `frames.showWindowControls`/terminal frame off, font size fix, and a code-group → tabs
  component (converter should emit Starlight `<Tabs>` in .mdx, or an EC tabs plugin).
- **Page title**: mock = breadcrumb then H1 inline with content column, no divider. Site = separate title banner
  with bottom border and extra top padding.
- **Content column**: mock ≈ 675px measure, site ≈ 760px.
- **Section rhythm**: mock draws a top rule above each H2 section; site does not.
- **TOC**: mock adds "edit this page ↗ / report an issue ↗" under the TOC.
- **Syntax colours**: mock uses token colours (keyword purple, string green); site uses github-light default.

Conclusion: fidelity needs a per-element checklist against each mock plus a repeatable `task visual`
(mock vs site screenshot pairs) — the owner's "not according to the design" is confirmed.
