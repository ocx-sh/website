# Icons

`icons.generated.mjs` is the registry data, written by
`packages/theme/scripts/generate-icons.mjs` from its `NAME_MAP`. Never edit it by
hand: change `NAME_MAP` and run `pnpm --filter @ocx-sh/theme icons`. A unit test
fails when the checked-in file is stale. Every icon renders inline in
`currentColor` through `components/ui/Icon.astro`; none carries a colour of its own.

| Source | Icons | Licence |
|---|---|---|
| [Lucide](https://lucide.dev) via `@iconify-json/lucide` | interface, action, the generic `shell` icon and `elvish` (Lucide `lambda`); stroked, 24px grid | ISC, MIT for Feather-derived icons (THIRD_PARTY_NOTICES) |
| [Simple Icons](https://simpleicons.org) via `@iconify-json/simple-icons` | `github`, `apple`, `windows`, `powershell`, `nushell`, `fish` | CC0-1.0 (listed in THIRD_PARTY_NOTICES) |
| Material Design Icons `linux` | `linux` (Tux; Simple Icons' is 5.3 KB), `d` attribute verbatim from Templarian/MaterialDesign `svg/linux.svg` | Apache-2.0 (THIRD_PARTY_NOTICES) |
| vscode-icons `file-type-shell` | `cmd`, a console window with a prompt | MIT (THIRD_PARTY_NOTICES) |
| This theme | `sort`, two filled triangles DataTable inks one at a time | Apache-2.0 |

The `*.svg` files here are the old shell tab backgrounds, still read by
`starlight.css`; they go once shell tabs render `<Icon>` inline.
