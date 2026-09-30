---
title: Code
description: Expressive Code frames, titles, terminals and highlights.
---

Expressive Code renders every fence: a plain block, a titled frame with line marks, and a
terminal frame. Syntax colours per role have their own page:
[Code colours](../code-colours/).

```sh
ocx install ocx.sh/nodejs/node:24
```

```toml title="ocx.toml" {5}
#:schema https://ocx.sh/schemas/project/v1.json

[tools]
pnpm = "ocx.sh/pnpm/pnpm:11"
node = "ocx.sh/nodejs/node:24"
```

Insertions and deletions get a fixed, centred `+`/`−` gutter with a clear gap
before the code; the minus is U+2212 so both marks read the same width.

```ts title="astro.config.mjs" ins={2} del={3}
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import legacy from './legacy-theme';
```

```powershell frame="terminal"
irm https://setup.ocx.sh/pwsh | iex
```

## Languages

One block per shell/language the site highlights, across every Expressive Code
box: plain fence, titled frame and `frame="terminal"`. The blocks above cover
sh, toml, ts and powershell. Tabs on Zag (with the
same shells) are on the [Tabs](/docs/components/tabs/) page; both routes
share this one highlighter config (`ec.mjs`).

```bash
if [ -f "$OCX_HOME/bin" ]; then echo "found"; fi # bash
```

```zsh
setopt EXTENDED_GLOB # zsh
```

```fish
if test -f $OCX_HOME/bin; echo found; end # fish
```

```nushell
let home = $env.OCX_HOME; print $"home is ($home)" # nushell
```

```elvish
set-env OCX_HOME ~/.ocx; echo $E:OCX_HOME # elvish
```

```pwsh
Get-ChildItem -Path $env:OCX_HOME # pwsh alias
```

```json title="ocx.metadata.json"
{ "name": "ocx", "strict": true, "retries": 3 }
```

```jsonc
{ "name": "ocx", // jsonc comment
  "strict": true }
```

```yaml
jobs:
  build:
    runs-on: ubuntu-latest # yaml
```

```js
function greet(name) { return `hi ${name}`; } // js
```

```rust
fn main() { let n: i32 = 3; println!("{n}"); } // rust
```

```python
def main(n: int = 3) -> None:
    print(f"hi {n}")  # python
```

```go
package main

func main() { n := 3; println(n) } // go
```

```diff
- old line
+ new line
```

```dockerfile
FROM node:24
RUN echo "ready" # dockerfile
```

```ini
[tools]
node = "24" ; ini
```

```xml
<tool name="node"><!-- xml --></tool>
```

```html
<div class="ocx"><!-- html --></div>
```

```css
.ocx-copy { color: var(--ocx-color-accent); } /* css */
```

```sql
SELECT * FROM tools WHERE name = 'node'; -- sql
```
