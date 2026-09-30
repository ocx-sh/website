# Discover: Bunny hosting, deploy action, lore authoring (2026-09-27, explorer)

## Bunny
- www-setup: one Storage Zone (`sh-ocx-setup`, Frankfurt) + one Pull Zone (`6415130`) for setup.ocx.sh. Directory-backed storage: a path is a file XOR a directory; friendly URLs are routed, never stored.
- edge-rules.py: rule(desc, patterns, target, action, p2); ≤5 patterns per trigger (auto-chunk, MatchAny); header_rule via MatchNone; path-segment vars `%{Path.0}`/`%{Path.1}` keep 9/20 rules; plan (no creds, runs in PR CI) / apply (delete-all + POST + purge) / verify (fetch + byte diff). Zone settings (origin shield, retries, stale-while-*) separate axis, read back after POST.
- bunny.sh: curl PUT/GET with `AccessKey`, `Checksum` SHA256-upper; GET-then-PUT for append-only.
- Secrets: CI gets `BUNNY_STORAGE_KEY`/`BUNNY_STORAGE_ZONE` from a GitHub environment (`setup.ocx.sh`). `BUNNY_API_KEY` (account-wide: rules/purge/zone) deliberately local-only.
- michael-herwig Taskfile: deploy gates on clean tree → per-file PUT (retry 3) → `bunnycdn_errors/404.html` → purge via `pullzone/<id>/purgeCache` (needs API key). No list/delete prior art anywhere — prune is new code.

## hetzner1 nginx (ocx-sh-*.conf) — apex cutover inventory
- `ocx.sh`: `/v2/…` → JFrog docker registry (`sh-ocx-oci-prod`) **plus** `/` → ocx-website.pages.dev. Registry must survive the apex move (Bunny cannot proxy /v2 to JFrog the same way — cutover blocker to design for).
- `dev.ocx.sh` → dev.ocx-website.pages.dev. `grim.ocx.sh` → registry + SPA. `setup.ocx.sh` legacy nginx (Bunny live). Others (artifactory, bazel-cache, sccache, grafana, otel) unrelated.
- No index.ocx.sh / lore.ocx.sh host on hetzner1.

## Current URL inventory (redirect list seed)
| Property | Current | Target |
|---|---|---|
| ocx docs/site | ocx.sh → CF Pages | ocx.sh/, /docs/ |
| dev | dev.ocx.sh → CF Pages | Bunny preview hostname |
| catalog docs | ocx-sh.github.io/catalog/ | /apps/catalog/ |
| python sdk | ocx-sh.github.io/ocx-sdk-python/ | /integrations/python/ |
| rules_ocx | GH Pages (no site_url) | /integrations/bazel/ |
| index/catalog | index.ocx.sh (CF Pages per HANDOVER) | /catalog/ |
| lore | lore.ocx.sh | stays subdomain (gate answer) |

## Action pattern
- setup-ocx: node24 JS action; setup-grimoire: composite. Release: tag vX.Y.Z → validate action.yml contract (yq) → test → move floating `vN` after tests → gh release. Consumers pin SHA + `# vN` comment.

## Lore authoring
- publish.toml: flat `ghcr.io/ocx-sh/lore/<name>`, per-entry version, `description = { readme = "docs/<name>.md", logo = "assets/lore-*.svg" }`. css-theming v0.1.0 (no one-member bundle). docs-* split rationale: rule = per-edit gate, skills = once-per-project discover/wire, review = on-demand.
- Rule frontmatter `paths:` globs; skill frontmatter name/description/license/metadata.{summary,keywords}; bundle TOML members untagged (consumer lock freezes).
- CI publish.yml on main: grim publish --announce (contents/packages/pull-requests write).
