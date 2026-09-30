---
name: ocx-theme-deploy
description: Deploying an ocx.sh section to Bunny with the reusable deploy action that ocx-sh/website ships at .github/actions/deploy - consumer workflow template, inputs and outputs, the BUNNY_STORAGE_KEY environment secret, upload order, stale-HTML prune, error behaviour, and preview builds. Use when adding or editing a GitHub Actions workflow that publishes a site to ocx.sh, when wiring ocx-sh/website/.github/actions/deploy, storage-key, dist or path inputs, when a deploy fails on a claim, a missing index.html or Pagefind entry, a 401, or a failed upload, when onboarding a new repo to Bunny, when asked about previews or preview.ocx.sh, or when someone suggests putting BUNNY_API_KEY or a cache purge into CI. Not for the Astro build itself (ocx-theme-setup) or the pre-deploy quality gates (ocx-theme-quality).
license: Apache-2.0
metadata:
  summary: Ship an ocx.sh section to Bunny with the ocx-sh/website deploy action - template job, inputs, secrets, ordering guarantees
  keywords: ocx,ocx-sh,deploy,bunny,bunnycdn,github-actions,workflow,reusable-action,cdn,static-site,pagefind,preview,secrets,astro,starlight
---

# ocx-theme-deploy

Each repo that owns a claim in `nav.json` builds its site and uploads it to
its own Bunny storage zone with one reusable action from `ocx-sh/website`.
The action versions with the theme: it is released under the same `vX.Y.Z`
tag as `@ocx-sh/theme`.

Read `action.yml` at the commit you pin before relying on the tables below;
they are the contract that action implements.

Contents: [Owner steps](#before-the-first-deploy-owner-steps) ·
[Workflow](#the-workflow) · [Inputs and outputs](#inputs-and-outputs) ·
[What a deploy does](#what-a-deploy-does) · [Previews](#previews) ·
[Do not](#do-not) · failures in [references/failure-modes.md](references/failure-modes.md)

## Before the first deploy (owner steps)

These need account access; ask the owner, never try them from CI:

1. The repo's claim exists in `nav.json` in a released theme
   (`ocx-theme-setup`, `references/nav-registry.md`).
2. The owner runs `task bunny:onboard` in `ocx-sh/website`. It creates the
   storage zone `sh-ocx-web-<repo>` (`zoneName`: `ocx-sh/rules_ocx` →
   `sh-ocx-web-rules-ocx`) and stores its password as the secret
   `BUNNY_STORAGE_KEY` in the repo's GitHub environment `ocx.sh`, limited to
   the `main` branch.

**Secrets rule.** CI only ever holds `BUNNY_STORAGE_KEY`, one zone's password.
`BUNNY_API_KEY` (the account key) lives in the owner's gitignored `.env` and
never in a workflow, a secret, a file or a log. No cache purge runs in CI.

## The workflow

Deploys run only on a release tag or by hand. A push to `main` builds and
checks, but does not deploy.

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    tags: ['v*']
  workflow_dispatch:
permissions: {}
jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@<commit-sha> # pin every action by full SHA
      # install your toolchain and dependencies here
      - run: npx astro build # Starlight writes dist/, including dist/pagefind/
      - run: npx ocx-site check --dist dist
      - uses: actions/upload-artifact@<commit-sha>
        with: { name: site, path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: ocx.sh, url: '${{ steps.deploy.outputs.url }}' }
    concurrency: { group: ocx-sh-deploy, cancel-in-progress: false }
    permissions: {}
    steps:
      - uses: actions/download-artifact@<commit-sha>
        with: { name: site, path: dist }
      - id: deploy
        uses: ocx-sh/website/.github/actions/deploy@<commit-sha> # vX.Y.Z
        with:
          dist: dist
          storage-key: ${{ secrets.BUNNY_STORAGE_KEY }}
```

Replace each `<commit-sha>` with the full commit SHA of the release you pin,
with the tag in the trailing comment; Dependabot's `github-actions` ecosystem
keeps them current. Keep `cancel-in-progress: false`: a cancelled deploy stops
between phases.

## Inputs and outputs

| Input | Required | Default | Meaning |
|---|---|---|---|
| `dist` | yes | | Build output; its root maps to `path` |
| `storage-key` | yes | | The zone password. Empty fails at once, before any request |
| `path` | no | The repo's only claim, or its shortest when it owns several | Public path `dist` maps to; must be a claim the repo owns |
| `storage-host` | no | `storage.bunnycdn.com` | Regional storage endpoint |
| `dry-run` | no | `false` | List and plan, write nothing |

| Output | Meaning |
|---|---|
| `url` | `https://ocx.sh<path>` |
| `uploaded`, `deleted` | File counts |

## What a deploy does

1. Resolves repo, zone and path; checks the claim and the key. No requests.
2. Runs the `ocx-site check` logic on `dist`. `dist/index.html` must exist;
   a `search: true` claim needs `dist/pagefind/pagefind-entry.json`.
3. Lists the zone's current files under the path.
4. **Phase 1**: uploads every file except HTML and the top-level Pagefind
   entry files: hashed `_astro/` assets and Pagefind chunks first. Eight in
   parallel, SHA-256 checksum on each, three retries.
5. **Phase 2**: uploads the HTML, the top-level Pagefind files, and
   `404.html` as the zone's error page.
6. **Prune**: deletes HTML files the new build no longer has. Stale non-HTML
   is never deleted by a deploy; the owner garbage-collects old assets long
   after any cache lifetime.
7. Writes the step summary and outputs.

The guarantee: new assets exist before any page that references them, and no
deploy deletes an asset, so no cached page ever points at a missing file.
Failures and what the site looks like after each:
[references/failure-modes.md](references/failure-modes.md).

## Previews

Previews are build-only for now: a pull request builds and runs
`ocx-site check` and the quality gates, but nothing is hosted. Planned preview
hosts are `https://<site>.preview.ocx.sh`; link there only once the owner
confirms a preview is live.

## Do not

- Put `BUNNY_API_KEY`, a purge call or a zone-management step in CI.
- Deploy from a fork, a pull request, or any branch the `ocx.sh` environment
  does not allow.
- Upload with another tool beside the action: it breaks the ordering
  guarantee.
- Deploy to a path your repo does not own in `nav.json`.
