<!-- doc_type: readme -->

# @ocx-sh/theme

Shared tokens, base styles, navigation registry and Starlight plugin for the
`ocx.sh` sites.

## Install

```bash
npm install @ocx-sh/theme
```

Peer dependencies: `astro ^7` and `@astrojs/starlight >=0.42.0 <0.43`.

## Use with Starlight

Every section on `ocx.sh` mounts under a non-root `base` that must be a claim
path in `nav.json`, and Starlight reads `trailingSlash` before a plugin can
set it, so the consumer sets both:

```js
// astro.config.mjs
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  base: '/docs/', // a claim path in nav.json
  trailingSlash: 'always', // required before the plugin runs
  integrations: [
    starlight({
      title: 'ocx theme example',
      plugins: [ocxTheme()],
    }),
  ],
});
```

The plugin takes no options. It validates `base` against the path registry,
sets `site` and injects the theme's tokens, base styles, Starlight overrides,
fonts and Pagefind merge configuration. A consumer's own `customCss`,
`components` and `expressiveCode` entries win over the theme's.

## Exports

| Export | Contents |
|---|---|
| `./tokens.css` | design tokens |
| `./base.css` | base styles shared outside Starlight |
| `./fonts.css` | plain CSS fonts, for the VitePress catalog adapter |
| `./starlight.css` | Starlight chrome overrides |
| `./starlight` | the plugin (`ocxTheme()`, default export) |
| `./starlight/*.astro` | individual Starlight component overrides |
| `./components/*.astro` | theme components, including the `ui/` primitive set (Button, Input, Select, and others) |
| `./nav.json` | the `nav.json` v4 path registry data |
| `./nav` | registry helpers (`validate`, `claimFor`, `mergeTargets`, and others) over that data |
| `./vitepress` | CSS-only adapter for a custom VitePress theme |
| `./logo.svg` | the ocx logo |
| `./icons` | the icon registry and its helpers |

## CLI: `ocx-site`

`ocx-site check` validates a built site against the path registry. Every
root-relative link must fall under a claim, and the dist layout must match
its claim. A `search: true` claim's Pagefind bundle must match the version
this theme was built against.

```bash
npx ocx-site check --dist dist
```

| Flag | Meaning |
|---|---|
| `--dist <dir>` | the built site to check |
| `--repo <owner/name>` | the consumer repo, when it cannot be read from the git remote |
| `--path <p>` | the claim path this build owns, when it cannot be inferred |

Exit codes: `0` clean, `1` problems found, `2` usage error.
