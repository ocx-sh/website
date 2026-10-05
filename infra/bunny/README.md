<!-- doc_type: runbook -->

# Bunny runbook

Run this to bring Bunny up from nothing: the M0 probes, the dev zone (OG-D) and the preview zones (OG-V). The owner runs every step with the account key. CI never holds that key. Each step names its verify command and its rollback. The later cutover steps (prod zone, nginx, DNS) are in the [cutover runbook](../cutover/README.md).

## Before you start

- The account key lives in the gitignored repo-root `.env` as `BUNNY_API_KEY`. Copy `.env.example` to start. Never commit it and never paste it into a command line.
- CI never gets `BUNNY_API_KEY`. Every task that reads it exits 1 before any request when `CI` is set or the key is empty. Never add the key to a workflow, an environment or a repository secret.
- CI holds one storage-zone password per zone and nothing else. `bunny:onboard` pipes it to GitHub on stdin and never prints it.
- Create the GitHub environments first. `bunny:onboard` exits 1 without them, or when one has no deployment branch policy, before any Bunny request. Step 1 of OG-D below creates them.
- The zones already exist: storage zone `sh-ocx-website`, pull zones `sh-ocx` (prod) and `sh-ocx-dev` (dev). The tasks adopt them.
- Run every command from the repo root through the toolchain: `ocx exec -- task <name>`. Only the tasks that write to Bunny read `.env`.
- Hand-made dashboard rules never carry the `ocx:` prefix, so `bunny:apply` never touches them. Delete your own after each probe.

## The tasks

Each task below is one step of the sequences further down. Every task that writes to Bunny prints what it changed. The ones that read the zone back exit 1 and name the field that differs.

### Onboard a repo

```bash
task bunny:onboard -- ocx-sh/website
```

This creates or adopts the repo's storage zone, sets its 404 page to `/bunnycdn_errors/404.html`, and sets the secret `BUNNY_STORAGE_KEY` in the repo's `ocx.sh` environment. A re-run changes nothing. With `--preview <site>` it sets `BUNNY_PREVIEW_KEY_<SLUG>` in the `previews` environment of this repo instead.

Verify: `gh secret list --env ocx.sh --repo ocx-sh/website` names `BUNNY_STORAGE_KEY`.

Rollback: `gh secret delete BUNNY_STORAGE_KEY --env ocx.sh --repo ocx-sh/website`. The storage zone stays. Delete it in the dashboard only when no deploy uses it.

### Reconcile a pull zone

```bash
task bunny:zone:apply -- --zone dev
```

This creates the pull zone when it is absent and points its default origin at the storage zone. It sets the cache, retry and Host-header settings and Force SSL, then reads every value back. It never adds a hostname. The owner adds `ocx.sh` to the prod zone in the dashboard.

Verify: the last line says `read back equal`. A field the API ignored exits 1 and is named.

Rollback: check out the previous commit and rerun the task. Delete a pull zone in the dashboard only.

### Apply edge rules

```bash
task bunny:apply -- --zone dev --dry-run
task bunny:apply -- --zone dev
```

The dry run only reads. The real run upserts every planned `ocx:*` rule, then deletes stale `ocx:*` rules, then reads back. A routed path is never unrouted in between. It refuses with zero writes when the zone would pass 50 rules.

Verify: the last line says `read back equal`.

Rollback: check out the previous commit and rerun `task bunny:apply -- --zone dev`.

### Verify a zone

```bash
task bunny:verify -- --zone dev
```

This needs no key. It requests the zone's `b-cdn.net` host once for every path the planned rules claim. It checks status, `Location`, `noindex`, the canonical link and origin leaks.

Verify: the output says `0 failed`. Each failure prints one `FAIL <kind> <path>` line with its reasons.

Rollback: none, the task only reads. After a red run, reapply the previous commit and verify again.

### Purge a cache

```bash
task bunny:purge -- --zone dev /docs/
task bunny:purge -- --zone dev
```

Use this in an emergency only: HTML expires from the edge after 60 seconds, and CI never purges. A path purges as a prefix on every hostname the zone serves. Without a path the whole zone is purged. Cloudflare's cache is separate and stays untouched.

Verify: `curl -sI https://sh-ocx-dev.b-cdn.net/docs/` answers `CDN-Cache: MISS` on the first request.

Rollback: none. A purge cannot be undone, and the cache refills from the origin.

### Collect stale assets

```bash
task bunny:gc -- --zone dev --older-than 30d --dry-run
task bunny:gc -- --zone dev --older-than 30d
```

A deploy never deletes assets, so a zone grows with every release. Run this monthly, dry run first. It deletes a non-HTML file only when both conditions hold:

- The file's last change is further back than `--older-than`.
- The file's last change is more than one hour before its claim's live `index.html`.

It skips a claim whose `index.html` is missing or less than one hour old. It never deletes HTML, `bunnycdn_errors/` or a file under another repo's claim.

Verify: the dry run lists only files you expect. After the real run, `task bunny:verify -- --zone dev` is green and a page still loads.

Rollback: none for a deleted file. Redeploying the commit that built it uploads the file again.

## M0: Bunny probes

Goal: four answers about Bunny's behaviour, and the JSON they come from. The probes are P1 (`OriginStorage`), P7 (bare `OriginUrl`), P8 (redirect templates) and P9 (`pagefind.js`). They run on the dev zone `sh-ocx-dev`, which carries no real traffic, plus one scratch storage zone. M0 may run before OG-D.

Build every probe rule by hand in the dashboard, so the recorded JSON shows what the dashboard writes. Record each result in the M0 table of `.agents/plans/plan_website-buildout.md`: fill the Result row, then the Decision row. The topology is B when P1 (1) to (3) pass and C when any fails. Until the results are folded in, the hand-written shapes are inline in `verify.test.ts`, `purge.test.ts`, `s114.test.ts` and the other tests of this directory, in `fake-api.ts`, and in the constants the `ponytail:` notes of `rules.mjs`, `zone.mjs`, `apply.mjs`, `gc.mjs` and `onboard.mjs` name. The agent re-checks each against the recorded response and swaps the fixture.

### Record a response

Run this once per fixture below. It reads one API path with the account key and writes the JSON with every secret field emptied.

```bash
set -a; . ./.env; set +a
ocx exec -- node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { createClient, redact } from "./infra/bunny/api.mjs";
const [path, file] = process.argv.slice(1);
const json = redact(await createClient(process.env).get(path));
writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
' /pullzone/<id> infra/bunny/fixtures/p1-pullzone.json
```

Replace `<id>` with the number in the zone's dashboard URL, and change the file name per probe. Never commit a file you have not opened.

Verify: `task bunny:test` is green. Its fixture guard fails on any secret-named field that is not empty.

Rollback: delete the file.

### P1: OriginStorage routes to a second zone

1. Create the scratch storage zone `sh-ocx-m0-scratch` in the dashboard. Pick the HTTP API, not S3, and region DE.
2. Upload `m0/x.txt` with the content `x`, `m0/index.html` and `bunnycdn_errors/404.html`. Give each a distinct body.
3. On `sh-ocx-dev`, add an edge rule. Its action sets the origin to a storage zone (API name `OriginStorage`) and names `sh-ocx-m0-scratch`. Its trigger is the URL `https://sh-ocx-dev.b-cdn.net/m0/*`.
4. Request the four paths.

```bash
curl -si https://sh-ocx-dev.b-cdn.net/m0/x.txt
curl -si https://sh-ocx-dev.b-cdn.net/m0/
curl -si https://sh-ocx-dev.b-cdn.net/m0
curl -si https://sh-ocx-dev.b-cdn.net/m0/missing
```

Pass criteria:

- (1) `/m0/x.txt` answers 200 with the body `x`. The path was kept.
- (2) `/m0/` and `/m0` answer 200 with the body of `m0/index.html`.
- (3) `/m0/missing` answers 404 with the body of `bunnycdn_errors/404.html`.

Record `p1-pullzone.json` from `/pullzone/<id>`. Its rule's `ActionParameter1` is the field that matters. Record `p1-storagezone.json` from `/storagezone/<id>` of the scratch zone. Write the three outcomes in the M0 Result row.

Side answer: upload a changed `m0/x.txt` and request it again at once. An old body with `CDN-Cache: HIT` means a storage write does not purge the cache. A new body means it does. Record which.

Verify: all of (1) to (3) match. If one fails, record which and set the topology to C.

Rollback: delete the dashboard rule and the scratch storage zone.

### P7: a bare OriginUrl keeps the path

1. On `sh-ocx-dev`, add an edge rule with the action `OriginUrl` and the value `https://ocx-website.pages.dev`. Its trigger is `https://sh-ocx-dev.b-cdn.net/docs/*`.
2. Confirm the zone's `AddHostHeader` is `false`. `bunny:zone:apply` sets it.
3. Request the path.

```bash
curl -si https://sh-ocx-dev.b-cdn.net/docs/
```

Pass: the answer is 200 with the Pages page for `/docs/`. The path was kept. Pages routes by Host, so a 200 shows it received `ocx-website.pages.dev`.

Record `p7-pullzone.json` and the outcome. If the path is lost, the fallback is the full URL with `%{Path.0-}`.

Verify: the 200 and the page body match.

Rollback: delete the dashboard rule.

### P8: a redirect keeps the rest of the path and the query

1. On `sh-ocx-dev`, add an edge rule with the action Redirect, status 302 and the value `https://index.ocx.sh/%{Path.1-}`. Its trigger is `https://sh-ocx-dev.b-cdn.net/m8/*`.
2. Request a deep path with a query.

```bash
curl -si 'https://sh-ocx-dev.b-cdn.net/m8/a/b/?q=1'
```

Pass: the answer is 302 with `Location: https://index.ocx.sh/a/b/?q=1`. Repeat with `%{Path.2-}` and `/m8/x/a/b/`. The tail starts at segment 2, so the `Location` ends in `a/b/`.

Record `p8-pullzone.json` and both outcomes. If the rest or the query is lost, the fallback is one exact rule per known page.

Verify: both `Location` values match.

Rollback: delete the dashboard rule.

### P9: pagefind.js is JavaScript and compressed

1. Upload a built `pagefind.js` to the scratch zone as `m0/pagefind.js`. Any built site has one under `pagefind/`.
2. With the P1 rule still in place, request it with compression offered.

```bash
curl -sI -H 'Accept-Encoding: br, gzip' https://sh-ocx-dev.b-cdn.net/m0/pagefind.js
```

Pass: `content-type` contains `javascript`, and `content-encoding` is `br` or `gzip`.

Write the headers you saw in the M0 Result row. No JSON fixture is needed. If the type is wrong, the fallback is a Content-Type rule, one more rule in the plan.

Verify: both headers match.

Rollback: delete the uploaded file.

### Hand the results to the agent

Tell the agent that M0 is recorded. It replaces the hand-written fixtures with your files and sets the rule enums from `p1-pullzone.json`. It also regenerates the snapshots and applies a fallback if a probe took one. OG-D needs that change merged.

Verify: `task bunny:test` is green on the agent's change.

Rollback: delete the recorded files and keep the hand-written fixtures.

## OG-D: Bunny dev up

Goal: the dev zone serves the root site on `https://sh-ocx-dev.b-cdn.net/` and `bunny:verify` is green. The deploy and the `cutover:verify` run follow in the [cutover runbook](../cutover/README.md#og-d-bunny-dev-up).

### Step 1: create the environments

Create `ocx.sh` and `previews` in `ocx-sh/website`, each limited to the branch `main`. The commands are in step 1 of the cutover runbook's OG-D.

Verify: `gh api repos/ocx-sh/website/environments/ocx.sh` and the same call for `previews` both answer 200.

Rollback: `gh api -X DELETE repos/ocx-sh/website/environments/ocx.sh`, and the same for `previews`.

### Step 2: onboard the website repo

```bash
task bunny:onboard -- ocx-sh/website
```

Verify: `gh secret list --env ocx.sh --repo ocx-sh/website` names `BUNNY_STORAGE_KEY`. A missing environment exits 1 before any Bunny request.

Rollback: `gh secret delete BUNNY_STORAGE_KEY --env ocx.sh --repo ocx-sh/website`.

### Step 3: bring the dev zone up

```bash
task bunny:zone:apply -- --zone dev
task bunny:apply -- --zone dev --dry-run
task bunny:apply -- --zone dev
task bunny:verify -- --zone dev
```

Read the dry run before the real apply. The verify needs the root site deployed to answer 200 on `/`. When only that probe is red, run the cutover runbook's deploy step and verify again.

Verify: `task bunny:verify -- --zone dev` ends with `0 failed`.

Rollback: check out the previous commit and rerun `task bunny:apply -- --zone dev`.

## OG-V: preview zones

Goal: each consumer preview site has its own storage zone, pull zone and deploy secret. The sites are `ocx`, `rules-ocx`, `python-sdk` and `catalog`. Production zones stay untouched. Repeat steps 1 and 2 for each site. The deploy follows in the [cutover runbook](../cutover/README.md#og-v-preview-zones).

### Step 1: onboard a preview site

The `previews` environment already exists from OG-D. Use the site's name, as `rules_ocx` or `python-sdk`.

```bash
task bunny:onboard -- --preview <site>
```

Verify: `gh secret list --env previews --repo ocx-sh/website` names `BUNNY_PREVIEW_KEY_<SLUG>`. The slug is the site name uppercased, with `-` as `_`.

Rollback: `gh secret delete BUNNY_PREVIEW_KEY_<SLUG> --env previews --repo ocx-sh/website`.

### Step 2: bring the preview zone up

The zone argument takes the slug, which has no underscore: `preview:rules-ocx`, not `preview:rules_ocx`.

```bash
task bunny:zone:apply -- --zone preview:<slug>
task bunny:apply -- --zone preview:<slug>
```

Verify: both tasks end with `read back equal`. The zone answers on `https://sh-ocx-preview-<slug>.b-cdn.net/` after the cutover runbook's preview deploy, and `task bunny:verify -- --zone preview:<slug>` ends with `0 failed`.

Rollback: check out the previous commit and rerun both tasks. Delete a preview zone in the dashboard only.
