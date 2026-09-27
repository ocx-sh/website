---
title: Code
description: Expressive Code frames, titles, terminals and highlights.
---

```sh
ocx install ocx.sh/nodejs/node:24
```

```toml title="ocx.toml" {5}
#:schema https://ocx.sh/schemas/project/v1.json

[tools]
pnpm = "ocx.sh/pnpm/pnpm:11"
node = "ocx.sh/nodejs/node:24"
```

```ts title="astro.config.mjs" ins={2} del={3}
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import legacy from './legacy-theme';
```

```powershell frame="terminal"
irm https://setup.ocx.sh/pwsh | iex
```
