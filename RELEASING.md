<!-- doc_type: runbook -->

# Releasing

One stable tag `vX.Y.Z` releases everything this repo publishes, at that one
version:

- `@ocx-sh/theme` on npm, with provenance, through npm trusted publishing
  (GitHub OIDC, no token stored anywhere);
- the grim skills listed in `publish.toml`, pushed to `ghcr.io/ocx-sh/lore`
  with the rolling `X.Y`, `X` and `latest` tags;
- a GitHub release with generated notes.

`.github/workflows/release.yml` does all of it. It runs only on tag pushes to
`ocx-sh/website`, never on forks, and never needs `BUNNY_API_KEY` or an npm
token.

## Versioning

- Semver. Pre-1.0, a breaking change to tokens, exports or component markup
  bumps the minor version.
- The version lives in `packages/theme/package.json` and changes only in a
  reviewed pull request. The tag must equal `v` + that version and point at a
  commit on `main`; the workflow fails otherwise. It never derives the version
  from the tag, so the repository always records what was published.
- Stable tags only. A prerelease tag (`v1.2.0-rc.1`) does not trigger the
  workflow: grim rejects prerelease versions, and npm would move `latest`.

## No floating tag, consumers pin SHAs

This repo never creates, moves or pushes a major-only tag such as `v1`.
Only immutable `vX.Y.Z` tags exist, and the workflow cannot move one.

Consumers pin the full commit SHA of a release and keep the version in a
comment, for example `uses: ocx-sh/website/.github/actions/deploy@<sha> # v0.2.0`.
Dependabot proposes the next pin. The `X.Y`, `X` and `latest` tags exist only
on ghcr.io for the grim skills, never as Git tags.

## Cut a release

1. Open a pull request that sets `version` in `packages/theme/package.json`
   (and each `version` in `publish.toml` that is pinned instead of inherited).
   Squash-merge it.
2. Tag the squash commit on `main` with a signed tag and push it:

   ```sh
   git switch main && git pull --ff-only
   git tag -s v0.2.0 -m v0.2.0
   git push origin v0.2.0
   ```

3. Watch the Release run. It verifies the tag, runs `task check` and
   `task pack`, then publishes npm and the skills in parallel, then creates
   the GitHub release.

A tag that does not equal the `packages/theme/package.json` version turns the
verify job red and publishes nothing. Fix the version in a pull request and
tag the new commit.

Every publish step is idempotent: a version already on npm, a skill version
already on ghcr.io, or an existing GitHub release is skipped. If a job fails,
fix the cause and use **Re-run failed jobs**.

## First release (done by hand)

The owner released `v0.1.0` by hand and configured the trusted publisher.
Every later release is tag-driven, as in [Cut a release](#cut-a-release).
The steps stay here for a new package that needs the same bootstrap.

npm can bind a trusted publisher only to a package that exists, so the owner
publishes the first version from their machine. `npm`, not `pnpm`, publishes
it: it is the same client CI uses, and `--provenance=false` overrides
`publishConfig.provenance`, which works only in CI.

1. Merge the version bump (for example `0.1.0`) and tag it as in
   [Cut a release](#cut-a-release), step 2, but **do not push the tag yet**.
2. Publish from a clean checkout of that tag:

   ```sh
   git clone https://github.com/ocx-sh/website.git ocx-website-release
   cd ocx-website-release
   git checkout v0.1.0
   ocx exec -- task install
   ocx exec -- task pack
   npm login
   cd packages/theme
   ocx exec -- npm publish --access public --provenance=false
   ```

   npm asks for a one-time password when the account uses 2FA (`--otp`).
3. On npmjs.com, open **@ocx-sh/theme → Settings → Trusted publishing**, pick
   **GitHub Actions** and enter:
   - Organization or user: `ocx-sh`
   - Repository: `website`
   - Workflow filename: `release.yml`
   - Environment: leave empty
4. On the same page, under **Publishing access**, choose **Require two-factor
   authentication and disallow tokens**. Trusted publishing keeps working;
   classic tokens stop.
5. Push the tag: `git push origin v0.1.0`. The workflow skips npm (the version
   exists) and publishes the skills and the GitHub release.
6. After that first run, set each new package under
   **github.com/orgs/ocx-sh/packages** (the `lore/*` skills) to **Public**:
   ghcr.io creates packages private. Later releases keep the setting.

## Rollback

Never `npm unpublish`: it breaks every lockfile that pinned the version, and
npm blocks reusing the version number anyway.

1. Deprecate the bad version so installs warn:

   ```sh
   npm deprecate @ocx-sh/theme@0.2.0 "broken tokens; use 0.2.1"
   ```

2. If `latest` must move back before the fix ships:
   `npm dist-tag add @ocx-sh/theme@0.1.9 latest`.
3. Release the fix as a new patch version. For the grim skills, publishing the
   patch moves `X.Y`, `X` and `latest` forward; existing exact tags stay.
4. Leave the Git tag in place; mark the GitHub release as not latest if needed.
