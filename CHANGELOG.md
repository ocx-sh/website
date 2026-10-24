# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2026-10-24

### Changed

- The ecosystem menu reads "solutions"; catalog is a publish tool and the public index docs get an entry *(nav)*

### Fixed

- The command bar's copied check sits level with the copy icon inside Starlight content *(theme)*

## [0.2.2] - 2026-10-23

### Added

- Markdown widgets on Sätteri; drop ./remark *(theme)* **BREAKING**
- ./markdown renders the widgets outside Starlight *(theme)*
- InstallCommand, shell logo colours, well-known links *(theme)*

### Fixed

- Footer is a line and closes the page *(theme)*
- A click on a hover-opened ecosystem menu keeps it open *(theme)*
- The components gallery drops prev/next links *(docs)*
- An escaped \{#id\} sets the heading id in MDX *(theme)*
- Ocx-theme-components description fits grim's 1024 chars *(skills)*

## [0.2.1] - 2026-10-23

### Fixed

- Shell box-sizing reaches ::before and ::after *(theme)*

## [0.2.0] - 2026-10-23

### Added

- Serve rules_ocx, ocx-sdk-python and find_ocx from ocx.sh *(infra)*
- Remark plugins for migrated docs as @ocx-sh/theme/remark *(theme)*
- Terminal fetches its cast when seen or opened, not on page load *(theme)*
- /team/ is a root-site claim, no longer a legacy proxy path *(nav)*
- Team page and the content-addressed landing section *(site)*
- Audit only the pages a branch touches, locally *(lighthouse)*
- Terminal reserves its height from the cast header *(theme)*
- Ocx.sh/docs/ and /schemas/ are served from the ocx repo's own storage zone, not the pages.dev proxy *(infra)*
- Skeleton sizes a code block from its source *(theme)*
- Smooth skeleton swap and size lock *(theme)*
- ShellSession fuses command and output fences *(theme)*
- Starlark fences highlight through Python *(theme)*
- Skeleton sizes a terminal from its cast; terminals cap at 24 rows *(theme)*
- HubGrid category filter *(theme)*
- Hand /install/ to ocx-sh/www-setup *(site)* **BREAKING**
- Turn /install/ on in merged search *(site)*
- Plain-Astro Sidebar and fetch-on-open Popover/Hint *(theme)*
- Lighthouse best of 3, metrics summary and sticky PR comment *(ci)*
- CommandPalette, CopyMenu, ProseCodeCopy, LogoTile, set-from-code and Shell layout options *(theme)* **BREAKING**

### Documentation

- Pr-11 loop retro — ledger rows and report 2026-10-08 *(retro)*
- Cutover nginx snippet as rehearsed on edge.ocx.sh *(infra)*
- Cutover run log, ocx.sh served by Bunny *(infra)*
- Consumer feedback goes to the sibling checkout *(agents)*
- Working nu and elvish commands in Tabs stories *(examples)*
- Theme 0.2.0 plan; Zag manual-trigger and value-set spec deltas *(plans)*

### Fixed

- Park colliding edge-rule indexes before apply writes *(infra)*
- Cutover pagefind check accepts Bunny's max-age=0 *(infra)*
- Registry challenge check expects the probed host *(infra)*
- Includes stay inside srcDir and refuse cycles *(theme)*
- Dedupe astro and Starlight for a locally linked theme *(theme)*
- ./remark is an expected theme export *(pack)*
- Keep Skeleton's stylesheet inlined *(theme)*
- Cutover:verify checks a Starlight docs page instead of the VitePress nav bar *(cutover)*
- Expressive Code sizes travel with its own sheet *(theme)*
- ShellSession reads like a shell *(theme)*
- ShellSession copy button and seam *(theme)*
- ShellSession copy button fits one line *(theme)*
- Expressive Code config keys Astro's content cache *(theme)*
- Lighter gallery cards *(showcase)*
- Story heights fit theme-size code *(showcase)*
- Working nu and elvish install commands *(site)*
- Keep /install/ out of merged search until www-setup deploys *(site)*
- ShellSession copied pill and toast on multi-command stories *(theme)*
- Tab after a tab switch lands on the entering panel *(theme)*
- Drop the Plex Sans italic faces, &lt;em&gt; uses synthesized oblique *(theme)*
- Team avatar as a sized AVIF, not a 400 px JPEG *(site)*
- Sanitise the Lighthouse comment and state the best-of-3 bar *(ci)*
- Post the Lighthouse summary only when every line is an allowed shape *(ci)*
- Assert dom-size-insight, Lighthouse 13 replaced the dom-size audit *(ci)*

## [0.1.1] - 2026-10-08

### Added

- HubGrid, six feature icons and a lighter Input *(theme)*
- Reusable Bunny deploy action *(deploy)*
- Bunny zones, edge rules and legacy routes as code *(infra)*
- Cutover verification, old-URL seed and runbook *(infra)*
- Root site with hub and install pages and its gates *(site)*
- Fold M0 results into rules, apply and the fake API *(infra)*
- Sandbox mirrored catalog package files at the edge *(infra)*
- Claim /integrations/cmake/ for ocx-sh/find_ocx *(nav)*
- Shell layout and entry points for plain Astro sites *(theme)*

### Documentation

- Plan, ADR 0002 and research for phase 2 *(agents)*
- Design rules from the handover *(skills)*
- HANDOVER, AGENTS, README and RELEASING for phase 2
- Pre-release action pin and the consumer Lighthouse recipe *(skills)*
- Phase-3 consumers plan and its loop goal *(plan)*

### Fixed

- Storage zones are named sh-ocx-&lt;repo&gt; *(theme)*
- Terminal start overlay transitions only on exit *(theme)*
- Environment branch policies use the deployment-branch-policies endpoint *(infra)*
- Tabs crossfade panels in one grid cell *(theme)*
- Lone code frames keep the frame opaque through a tab switch *(theme)*
- Lone code frames switch tabs instantly *(theme)*
- Declare typescript so a git-subdirectory install can run prepack *(theme)*
- WithBase always prefixes a base-relative path *(theme)*
- Dialog and Drawer eager start counts only their own content *(theme)*
- Pack-smoke's publish dry run tolerates an already-published version *(gates)*

## [0.1.0] - 2026-10-04

### Added

- Theme workspace with live example and quality gate
- @ocx-sh/theme library, storybook showcase and release pipeline
- Logo, skeleton variants and motion on every state change *(theme)*

### Fixed

- Theme code fences on story pages *(showcase)*
[0.2.3]: https://github.com/ocx-sh/website/compare/v0.2.2..v0.2.3
[0.2.2]: https://github.com/ocx-sh/website/compare/v0.2.1..v0.2.2
[0.2.1]: https://github.com/ocx-sh/website/compare/v0.2.0..v0.2.1
[0.2.0]: https://github.com/ocx-sh/website/compare/v0.1.1..v0.2.0
[0.1.1]: https://github.com/ocx-sh/website/compare/v0.1.0..v0.1.1
[0.1.0]: https://github.com/ocx-sh/website/tree/v0.1.0

