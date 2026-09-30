---
name: ocx-theme-setup
description: Adding the @ocx-sh/theme Starlight plugin to an Astro site that joins ocx.sh, covering the ocxTheme() plugin options (breadcrumbs, root crumb), the base path that must be a nav.json claim, trailingSlash, site, fonts, favicon, customCss order, the Starlight component overrides, what overriding Search drops, Expressive Code and Pagefind merge settings, the VitePress CSS adapter, and the ocx-site check CLI. Use when installing or upgrading @ocx-sh/theme, writing or debugging astro.config.mjs for an ocx.sh section, when a build fails with "is not a claim path", "trailingSlash must be 'always'" or "site ... is not https://ocx.sh", when overriding a Starlight component such as Header, Search or Sidebar, when fonts, breadcrumbs or search merging look wrong, or when a new repo needs a path on ocx.sh. Not for picking or using individual components (ocx-theme-components) or deploying (ocx-theme-deploy).
license: Apache-2.0
metadata:
  summary: Wire @ocx-sh/theme into an Astro Starlight site on ocx.sh - base path, plugin options, overrides, fonts, search merge
  keywords: ocx,ocx-sh,astro,starlight,starlight-plugin,theme,astro-config,base-path,trailing-slash,pagefind,expressive-code,fonts,breadcrumbs,overrides,vitepress
---

# ocx-theme-setup

Every section of `ocx.sh` is its own Astro + Starlight build, mounted under its
own path and wearing `@ocx-sh/theme`. This skill gets a site to build with the
theme. The companion skills cover the rest:

| Task | Skill |
|---|---|
| Choosing and using components in pages | `ocx-theme-components` (`../ocx-theme-components/SKILL.md`) |
| Styling, tokens, dark mode, focus | `ocx-theme-theming` (`../ocx-theme-theming/SKILL.md`) |
| Icons | `ocx-theme-icons` (`../ocx-theme-icons/SKILL.md`) |
| Uploading the build to ocx.sh | `ocx-theme-deploy` (`../ocx-theme-deploy/SKILL.md`) |
| Budgets, Lighthouse, e2e gates | `ocx-theme-quality` (`../ocx-theme-quality/SKILL.md`) |

Missing a sibling? Install the whole set: `grim add ghcr.io/ocx-sh/lore/ocx-theme:latest`.

## 1. Claim a path first

`base` must be a **claim path** in the theme's `nav.json`, or the build stops.
Current claims: `/`, `/integrations/`, `/apps/`, `/install/` (ocx-sh/website),
`/docs/`, `/schemas/` (ocx-sh/ocx), `/catalog/` (ocx-sh/index),
`/integrations/bazel/` (ocx-sh/rules_ocx), `/integrations/python/`
(ocx-sh/ocx-sdk-python), `/apps/catalog/` (ocx-sh/catalog). `nav.json` in the
installed theme is the live list.

A new section is a pull request to `ocx-sh/website` adding a claim
(`{ path, repo, search }`) to `packages/theme/src/nav.json`, then a theme
release. Path grammar and the registry helpers: [references/nav-registry.md](references/nav-registry.md).

## 2. Install

```bash
pnpm add @ocx-sh/theme   # or npm install @ocx-sh/theme
```

Peers: `astro ^7` and `@astrojs/starlight >=0.42.0 <0.43`. The upper bound is
deliberate (the chrome CSS targets Starlight internals): a Starlight minor
arrives through a theme release, never by bumping it alone.

## 3. Configure

```js
// astro.config.mjs
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  base: '/integrations/bazel/', // your claim path
  trailingSlash: 'always', // required: Starlight reads it before plugins run
  integrations: [
    starlight({
      title: 'rules_ocx',
      plugins: [ocxTheme()],
    }),
  ],
});
```

Do not set `site`: the plugin sets `https://ocx.sh`, and any other value fails
the build. Hard failures, all thrown in the plugin's `config:setup`:

| Error | Fix |
|---|---|
| `base "…" is not a claim path; claims: …` | Use a claim path; add a claim first if yours is new |
| `site "…" is not https://ocx.sh` | Drop `site` or set it to `https://ocx.sh` |
| `trailingSlash must be 'always'` | Set `trailingSlash: 'always'` in the Astro config |

## 4. Plugin options

`ocxTheme(options)` takes one option today:

| Option | Default | Effect |
|---|---|---|
| `breadcrumbs` | `{}` (on, no root crumb) | The trail above every page title: section or hub, ecosystem entry, sidebar groups, page. `false` drops it. Splash pages never show one |
| `breadcrumbs.root` | absent | `{ label, href }` prepends a root crumb (e.g. `{ label: 'ocx.sh', href: '/' }`); `false` or absent means none |

```js
plugins: [ocxTheme({ breadcrumbs: { root: { label: 'ocx.sh', href: '/' } } })];
```

## 5. What the plugin sets for you

Read [references/plugin-behaviour.md](references/plugin-behaviour.md) before
overriding any of these; it lists merge rules and the exact override set.

- `customCss`: `@ocx-sh/theme/tokens.css`, `@ocx-sh/theme/base.css`,
  `@ocx-sh/theme/starlight.css`, then yours. Your CSS is unlayered, so it wins.
- `components`: thirteen Starlight overrides (Head, Header, Footer, PageTitle,
  TableOfContents, ThemeSelect, ThemeProvider, MobileMenuFooter,
  MarkdownContent, Search, Sidebar, MobileMenuToggle, PageFrame). Your keys win.
- Fonts: IBM Plex Sans and Mono (400, 600) through the Astro Fonts API with
  metric-matched fallbacks. Add no font of your own.
- `expressiveCode`: the theme's code frame and token colours, merged under yours.
- `pagefind.mergeIndex`: every other `search: true` claim, so one search box
  finds every section.
- A `/favicon.svg` route with the logo, unless you ship `public/favicon.svg` or
  set Starlight's `favicon`.

**Overriding `Search` drops four features.** The theme's `Search.astro` script
also mounts the header nav menu, the mobile menu drawer, the sidebar
collapsibles and the toaster (including copy toasts). The plugin logs a warning.
Copy the `<script>` of `@ocx-sh/theme/starlight/Search.astro` into your
override, or do not override `Search`.

## 6. Check the build

```bash
npx astro build
npx ocx-site check --dist dist
```

`ocx-site check` (the package's `bin`) fails when a root-relative link leaves
every claim, when the `dist` layout does not match the claim, or when a
`search: true` claim's Pagefind bundle is a different version from the theme's.
Exit codes: `0` clean, `1` problems, `2` usage. Flags `--repo <owner/name>` and
`--path <p>` cover a checkout without a git remote. The deploy action runs the
same check.

## Other generators

The VitePress catalog uses `@ocx-sh/theme/vitepress` (CSS-only adapter) plus
`@ocx-sh/theme/fonts.css` (plain `@font-face`, since it has no Astro Fonts API).
Header data for a non-Starlight site: `@ocx-sh/theme/nav.json` and the helpers
in `@ocx-sh/theme/nav`; the logo is `@ocx-sh/theme/logo.svg` (inline it, never
an `<img>`). On an Astro page, render it with `@ocx-sh/theme/components/ui/Logo.astro`
instead. No mdBook or MkDocs adapter exists.

## Keep the theme current

Add a Dependabot entry grouping `@ocx-sh/theme` in each consumer; a nav change
is a theme release, so it only reaches a site through that update:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: / # wherever package.json lives
    schedule: { interval: daily }
    groups:
      ocx-theme: { patterns: ['@ocx-sh/theme'] }
```
