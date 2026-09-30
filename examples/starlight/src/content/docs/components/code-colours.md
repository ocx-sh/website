---
title: Code colours
description: One syntax hue per role, the same across every language and Expressive Code box.
---

One hue per role, the same across every language and box: keywords, flags and `true`/`null`
purple; commands and functions blue; strings green; numbers amber; variables and data keys coral;
punctuation muted; comments upright. The fences on the [Code](../code/) page use the same colours.

## Syntax colours

```pwsh title="install.ps1"
$env:OCX_HOME = 'C:\ocx' # install root
irm https://setup.ocx.sh/pwsh | iex
Get-ChildItem -Path $env:OCX_HOME -Recurse | Where-Object { $_.Length -gt 1024 }
if (Test-Path "$env:OCX_HOME\bin") { Write-Host "ready: $env:OCX_HOME" }
```

```json title="ocx.metadata.json"
{
  "name": "node",
  "version": 24,
  "strict": true,
  "mirror": null,
  "platforms": ["linux/amd64", "darwin/arm64"]
}
```

```yaml title=".github/workflows/ci.yml"
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: false # fail fast
    steps:
      - run: ocx exec -- task check
```

```sh
export OCX_HOME="$HOME/.ocx" # install root
if [ -d "$OCX_HOME/bin" ]; then
  ocx install --global node:24 | tee -a install.log
fi
```

```toml title="ocx.toml"
[tools]
node = "ocx.sh/nodejs/node:24" # pinned major
retries = 3
strict = true
```

```elvish title="rc.elv"
use str
var home = $E:HOME # install root
set-env OCX_HOME $home/.ocx
for tool [node pnpm] { echo (str:to-upper $tool) }
if (has-env CI) { ocx install node:24 }
```
