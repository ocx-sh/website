<!-- doc_type: readme -->

# Deploy action

Uploads a built site to its Bunny storage zone for `ocx.sh`. Assets go up before pages, so a
visitor never gets a page that points at a file that is not there yet. It then deletes pages the
new build no longer has.

## Use it

```yaml
deploy:
  needs: build
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: { name: ocx.sh, url: '${{ steps.deploy.outputs.url }}' }
  concurrency: { group: ocx-sh-deploy, cancel-in-progress: false }
  permissions: {}
  steps:
    - uses: actions/download-artifact@<sha> # vN
      with: { name: site, path: dist }
    - id: deploy
      uses: ocx-sh/website/.github/actions/deploy@<sha> # vX.Y.Z
      with:
        dist: dist
        storage-key: ${{ secrets.BUNNY_STORAGE_KEY }}
```

Pin `uses:` to a commit SHA. The action reads the claim registry and the site checker from the
same checkout, so the SHA fixes all three.

## Inputs

| Input | Default | Meaning |
|---|---|---|
| `dist` | required | Build output. Its root maps to `path`. |
| `storage-key` | required | The repository's zone password. Empty fails the run before any request. |
| `path` | the repository's shortest claim | The public path `dist` maps to. It must be a claim the repository owns. |
| `storage-host` | `storage.bunnycdn.com` | Regional storage endpoint. |
| `dry-run` | `false` | List and plan. Sends only GET requests and prints each planned PUT and DELETE. |
| `preview` | empty | A preview site name or slug from `scripts/previews/sites.mjs`. Deploys to that site's zone `sh-ocx-preview-<slug>` at `/`. Cannot be combined with `path`. |
| `force-prune` | `false` | Delete stale HTML even when that is more than half of the listed pages (see the prune cap below). |

## Outputs

| Output | Meaning |
|---|---|
| `url` | `https://ocx.sh<path>`, or the site's preview address in preview mode |
| `uploaded` | Files uploaded. `0` in a dry run. |
| `deleted` | Stale HTML files deleted. `0` in a dry run. |

## What it does

1. Resolves the zone `sh-ocx-<name>` from `GITHUB_REPOSITORY` and checks that the repository
   owns `path`. Checks `dist` for links, layout and the Pagefind version (the `ocx-site check`
   rules). Requires `dist/index.html`. A failure here ends the run with zero requests.
2. Lists `<zone>/<path>`.
3. Uploads every file except HTML and the top-level `pagefind/` files, 8 at a time, each with its
   uppercase SHA-256 as `Checksum`. A network error, 5xx or 429 retries up to 3 attempts in total.
   Any other failure stops the run.
4. Uploads the top-level `pagefind/` files, then every HTML file. `404.html` goes to
   `bunnycdn_errors/404.html`.
5. Deletes listed `*.html` files this build did not upload. It never deletes anything else, and it
   skips other repos' claim subtrees and `bunnycdn_errors/`. If a delete fails the run fails, and the
   leftover page stays until the next deploy.

The prune cap runs first. Deleting more than half of the listed HTML files, with at least 10 listed,
fails the run after the uploads. The run names the count and deletes nothing. Such a
ratio points at a wrong `dist` or `path`. `force-prune: true` lifts the cap.

In preview mode the zone is `sh-ocx-preview-<slug>` and the path is `/`. The run skips the claim,
link and layout checks, which belong to a claimed path, and keeps every other step. An unknown site,
or `preview` together with `path`, fails with zero requests. Without `preview`, the action refuses
any `sh-ocx-preview-` zone.

A failed run leaves the site consistent: every page is old or new, and its assets exist. The key is
masked in the log from the first line and never appears in an error.

## Run it locally

`task deploy:dev` runs a dry run against an in-memory fake of Bunny. `task deploy:test` runs the
action's tests.
