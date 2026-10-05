# Phase 2 research, axis deploy: one domain, many repos, path-prefix ownership

Researched 2026-09-30. Scope: WP10 deploy action, WP12 CI hardening, secret scoping.
Claims carry a source URL; "unverified" marks what I could not confirm from a primary source.

## Recommendation (opinionated)

1. **Isolate by credential, not by convention.** One Bunny storage zone per repo
   (`sh-ocx-web-<repo>`, already the design) means a per-zone storage password can
   only write its own zone. "Never delete another section" is then structural; the
   action's claim check (`claimFor`, `zoneName`) is belt and braces. Keep it.
2. **Deploy is a JS action, not a reusable workflow.** The caller job owns
   `environment:`, `permissions:` and `concurrency:`, and passes `storage-key` as an
   input. Reusable workflows complicate environment secrets (they must be re-declared
   in the callee job and need `secrets: inherit`). Keep `using: node24`.
3. **Secrets: environment secret per consumer repo, not org secret.** Each repo
   needs a different key (one per zone), so an org-wide secret fits nothing. Use a
   GitHub environment `bunny` in every consumer with secret `BUNNY_STORAGE_KEY`,
   deployment branches limited to `main`, no required reviewers (a reviewer on every
   merge defeats the daily schedule; add one only for the cutover week).
   `BUNNY_API_KEY` stays local. No OIDC: I found no evidence Bunny accepts GitHub
   OIDC, so per-zone passwords plus environment gating is the best available.
4. **Ordering and deletion, as designed, plus three guards.** Assets and pagefind
   chunks first, HTML second, prune HTML only, never purge. Add: (a) refuse to prune
   when the upload phase had any error (rclone's rule); (b) refuse when `dist` has no
   `index.html` or lists fewer than a floor of HTML files versus remote (a
   `--max-delete` analogue, default cap e.g. 50% of remote HTML); (c) never
   delete hashed assets in the action, leave that to an age-based `gc` (old HTML held
   by the 60 s edge TTL and open tabs still reference them).
5. **Supply chain.** Consumers pin the action by full SHA with a `# vX.Y.Z` comment;
   **do not publish a floating `v1`** (immutable releases are incompatible with moved
   tags, and the design has none anyway). Enforce at org level with "Require actions
   to be pinned to a full-length commit SHA", gate with a `zizmor` job in `ci.yml`,
   and Dependabot `github-actions` with `cooldown.default-days`.

Concurrency: use `group: deploy-<path>`, `cancel-in-progress: false`, and **no**
`queue: max`. GitHub's default keeps one running plus one pending and replaces the
pending run with the newest, which is exactly "deploy the latest commit". Ordering
(assets first) makes even a cancelled run safe, but do not rely on that.

## Evidence

### Bunny Edge Storage API (action mechanics)

- PUT `https://{region}.bunnycdn.com/{zone}/{path}/{file}`, header `AccessKey` = storage
  zone password, optional `Checksum` = SHA-256 hex UPPERCASE, server rejects mismatch;
  201 on success, 401 bad key or wrong region host.
  https://docs.bunny.net/api-reference/storage/manage-files/upload-file ,
  https://bunny.net/docs/storage/http
- GET on a directory returns a JSON array (files and directories); DELETE on a
  directory removes it recursively; zone-root delete blocked unless
  `allowRootDelete=true` (which "permanently removes all files"). The action must
  never send that flag. https://bunny.net/docs/storage/http
- Each storage zone has two keys, read-write and read-only.
  https://docs.bunny.net/storage/quickstart (via search result; the HTTP page does not
  describe read-only keys). Use the read-only key for any future CI verify step.
- Purge is `POST https://api.bunny.net/pullzone/{id}/purgeCache` with header
  `AccessKey` = **account API key**; body may carry `CacheTag`.
  https://bunny.net/docs/api-reference/core/pull-zone/purge-cache . The account key has
  no per-zone scoping (medium confidence, blog-level source:
  https://www.jhanley.com/blog/bunny-net-account-and-api-keys/). So "no purge in CI" is
  not just policy, it is the only way to keep the account key out of CI; 60 s edge TTL
  plus stale-while-updating covers freshness, a local `bunny:purge` covers emergencies.
- No documented rate limit or replication-completion API on the classic HTTP API (the
  earlier research file `research-domain-bunny.md` reached the same finding).

### Ordering assets before HTML, version skew

- Cloudflare Stout hashed and uploaded scripts/styles first, then atomically copied
  HTML last; rollback = re-copy. Archived 2025-04-01, 753 stars, so the idea is
  proven but the tool is dead. https://github.com/cloudflare/Stout
- Version skew (old HTML asks for assets that a new deploy removed) is a known failure:
  https://github.com/vercel/next.js/discussions/66717 . Vercel and Amplify sell "skew
  protection" for it. Bunny has no atomic swap, so keep old hashed assets and prune
  them by age, not by the deploy that replaced them. Small repos implement "assets
  survive one more deploy" (e.g. https://github.com/bunizao/site/pull/228, weak
  evidence, single author): the `gc` module should do a time window (7 days) instead.
- Replication lag with no completion API means a brief mismatch is possible under any
  order; ordering shrinks it from "broken page" to "old or new page".

### Sync-with-delete safety (precedents)

- `aws s3 sync --delete` deletes destination files absent from source, filters
  exclude files from deletion, and sync is scoped to a prefix.
  https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html . Lesson: delete is
  safe only when bounded to the section's prefix and filters exclude the rest.
- rclone `sync`: "test first with --dry-run", `--max-delete` cap, default
  `--delete-after`, and "files in the destination won't be deleted if there were any
  errors". https://rclone.org/commands/rclone_sync/ . Adopt all three ideas:
  `dry-run` input (already in the contract), a delete cap, delete-after-success.
- The Marketplace "Bunny.net Storage Deployer" removes all files from the zone before
  uploading and needs the account key for purge; v0.0.2, 2 stars. The exact anti-pattern
  (window of an empty site). https://github.com/marketplace/actions/bunny-net-storage-deployer

### One domain, many repos (prior art)

- Next.js Multi-Zones: separate apps on one domain, each owns a path set, "URL paths
  should be unique to a zone", and each zone sets an `assetPrefix` so static assets do
  not collide; any proxy can route. Same shape as the claim registry plus Astro `base`.
  Zones may live in separate repos. https://nextjs.org/docs/app/guides/multi-zones
  Takeaway: the uniqueness rule lives in a central registry (our `nav.json` claims),
  and the prefix for assets must be part of the zone, never shared.

### Secret scoping

- Environment secrets are released to a job only after the environment's protection
  rules pass (reviewers, branch/tag restriction); up to 6 reviewers, one approval
  suffices; environments and their secrets are available in public repos on all plans.
  https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments
  and https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment
- zizmor `secrets-outside-env` flags `secrets.*` in a job without `environment:`;
  remedy is environment-level secrets. https://docs.zizmor.sh/audits/#secrets-outside-env
  Our deploy job must therefore declare `environment: bunny`.
- Secrets are not passed to runs from forks (except `GITHUB_TOKEN`), not passed to
  Dependabot-triggered runs, not passed automatically to reusable workflows, cannot be
  read in `if:`. https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
  Consequence: deploy triggers are only `push` (main), `schedule`, `workflow_dispatch`;
  never `pull_request_target`; PR and Dependabot runs build only.
- Environment secrets in reusable workflows need `environment:` inside the callee job
  plus `secrets: inherit` (community sources, e.g.
  https://cloudchronicles.blog/blog/Passing-Environment-Secrets-and-Variables-to-Reusable-Workflows-in-GitHub-Actions/).
  Another reason to ship an action, not a reusable workflow.
- Concurrency: one running plus one pending per group, pending replaced by the newest;
  `queue: max` (up to 100 queued, not combinable with `cancel-in-progress: true`) is
  new and unnecessary here.
  https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

### OIDC alternative

- GitHub OIDC tokens carry `sub`, `environment`, `job_workflow_ref` (the reusable
  workflow path and ref) and optional `repo_property_*` claims; a provider validates
  them and issues a short-lived token.
  https://docs.github.com/en/actions/concepts/security/openid-connect
- Search found no Bunny OIDC/workload-identity federation (absence of evidence, not
  proof; unverified). Re-check Bunny's changelog before WP7 closes. If it appears, use
  `job_workflow_ref` pinned to this repo's action and `environment: bunny`, and the
  storage password disappears.

### Supply chain

- SHA pinning is "currently the only way to use an action as an immutable release";
  repo, org and enterprise policy can require it and fails unpinned workflows.
  https://docs.github.com/en/actions/reference/security/secure-use ,
  https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/
- Default `GITHUB_TOKEN` to read-only and raise per job (same secure-use page): top
  level `permissions: {}`, deploy job needs only `contents: read`.
- Immutable releases are GA; tags of immutable releases cannot be moved or deleted, so
  moving `v1` conflicts (oras-project dropped floating tags for this reason).
  https://github.blog/changelog/2025-10-28-immutable-releases-are-now-generally-available/ ,
  https://github.com/oras-project/setup-oras/pull/164 . Enable immutable releases on
  `ocx-sh/website` and tell consumers to pin SHAs. This supersedes the "floating vN
  move" habit noted from setup-ocx in `discover-bunny-lore.md`.
- zizmor: 41 audit categories (vendor blog count); default `unpinned-uses` policy is
  ref-pin for `actions/*`, hash-pin for everything else. Add a policy row making
  `ocx-sh/*` hash-pin too. Relevant audits: `unpinned-uses`, `excessive-permissions`,
  `template-injection`, `artipacked` (use `persist-credentials: false`),
  `secrets-outside-env`, `cache-poisoning` (applies to release.yml: `cache: false` is
  already set), `dangerous-triggers`, `ref-version-mismatch`, `forbidden-uses`.
  https://docs.zizmor.sh/audits/ . Run via `zizmorcore/zizmor-action` pinned by SHA,
  `permissions: {}` top level, job `security-events: write, contents: read,
  actions: read`; `advanced-security: false` to print instead of SARIF.
  https://github.com/zizmorcore/zizmor-action
- Dependabot cooldown: GitHub applies a 3-day default to version updates (not security
  updates); for `github-actions` only `default-days` is accepted, not per-semver keys
  (blog-level sources: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
  for the option set; the github-actions restriction is from a third-party write-up,
  unverified). Set `default-days: 7` for github-actions.

### TypeScript action runtime (probe P3)

- Node type stripping is stable from v24.12.0 and v25.2.0; it refuses files under a
  `node_modules` path; imports need the `.ts` extension; type imports need `import
  type`; recommended tsconfig `erasableSyntaxOnly` + `verbatimModuleSyntax`.
  https://nodejs.org/api/typescript.html
- A JS action's checkout lives under `_actions/<owner>/<repo>/<sha>/`, not a
  `node_modules` path, so stripping should work, but the runner's bundled node24 minor
  may predate 24.12 (unverified). The P3 probe must print `process.version` on a real
  runner. Fallback ranking: (1) `.mjs` plus JSDoc checked by `tsc --checkJs`, which
  removes the question entirely and matches `packages/theme/src/*.mjs` already
  imported; (2) committed single-file bundle. Do not add a build step to CI only for this.

## Pitfalls for this repo

- `skills/ocx-theme-deploy` says deploy only on tag or dispatch; design section 3.1
  says push main plus daily schedule plus dispatch. Pick one before writing the
  action (recommend: push main for content repos, schedule only to self-heal
  and prune after a cooldown, dispatch for manual), then fix the skill in the same
  commit (`AGENTS.md` rule).
- The daily schedule is the only trigger that also runs with no code change; keep it
  read-mostly (no delete when nothing changed, so a bad scheduled build cannot prune).
- `previews.yml` already reserves a `previews` environment with per-zone keys; reuse the
  same action with `path: /` against the preview zones so preview and prod share code.
- Listing is non-recursive: recurse per directory client-side and cap depth and count
  so a bad response cannot loop or exhaust memory.
- Root claim `/` owns only top-level files plus `_astro/` and `pagefind/`; the
  action's prune for the root site must be limited to those, never `/docs/`, or the
  root deploy would wipe other sections if they share one zone (only true under
  fallback C, single storage zone; under the chosen design zones are separate and
  this is moot).
- 404: `404.html` goes to `bunnycdn_errors/404.html` per zone; ensure each zone has
  Error Handling configured once by `bunny:onboard` or every 404 is a plain 404.
- Do not log the storage key, the `AccessKey` header, or full request objects from
  retries; redact at the HTTP client layer and test that with the fake-Bunny harness.
- Third-party Bunny marketplace actions (e.g. the Bunny.net Storage Deployer): do not adopt; 1-maintainer,
  pre-1.0, delete-first.

## Adoption signals

- SHA pinning as a hard org policy, zizmor in CI and Dependabot cooldown are now
  mainstream 2026 practice (GitHub policy shipped 2025-08, cooldown default 3 days).
- Immutable releases GA 2025-10; actions projects are dropping floating `vN` tags.
- No Bunny deploy action has meaningful adoption (best found: v0.0.2, 2 stars); a
  house action is justified, and its distinguishing features (claim check, list-based
  prune, phased upload, per-zone key) have no competitor.
- Path-claim routing with per-zone asset prefixes is the documented multi-repo
  pattern for Next.js micro-frontends; no mainstream static-host action implements
  the claim-registry idea, so expect to own it.

## Open verifications (owner or later probes)

1. Bunny OIDC support (none found).
2. Node minor on `node24` runner (probe P3).
3. Whether Bunny can rotate a zone password via account API (needed for key rotation
   runbook; not confirmed here).
4. GitHub `sha_pinning_required` behaviour for local `./` and same-org reusable
   workflows on the pinned-SHA org policy (docs say all actions; test on website repo).
