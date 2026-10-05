<!-- doc_type: runbook -->

# Cutover runbook

Run this when `ocx.sh` moves from hetzner1 nginx and `pages.dev` to Bunny. It covers the gates OG-D (Bunny dev up), OG-P (prod zone), OG-N (nginx upstream to Bunny) and OG-V (preview zones). It also holds the deferred gates OG-C (apex DNS flip) and OG-T (retire hetzner1). Each step names its verify command and its rollback. The end state is a green `cutover:verify` run against `ocx.sh` through the public path.

Every step is run by the owner or the agent under the owner's standing grant. Run the steps in order. Stop at the first red verify and fix it before moving on.

## Before you start

- Credentials live in the gitignored repo-root `.env`: `BUNNY_API_KEY` and `CLOUDFLARE_API_TOKEN`. Never commit them, never paste them into a command line, and never run a zone, DNS or certificate step in CI.
- The zones already exist. The storage zone is `sh-ocx-website`. The pull zones are `sh-ocx` (prod) and `sh-ocx-dev` (dev). `bunny:onboard` adopts them.
- Run every command from the repo root through the toolchain: `ocx exec -- task <name>`. The `.env` is read only by the tasks that write to Bunny.
- Load only the Cloudflare token for the audit commands, never the whole `.env`, which would export `BUNNY_API_KEY` to every child process. The `cf` helper passes the token to `curl` on stdin, so it never appears in `argv`. Define both once per shell:

  ```bash
  export CLOUDFLARE_API_TOKEN=$(sed -n 's/^CLOUDFLARE_API_TOKEN=//p' .env)
  cf() { printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" | curl -s -K - "$@"; }
  ```

- hetzner1 is reached with `ssh hetzner`. Its nginx config lives in the `server-hetzner1` repo under `nginx/config/main/conf.d/`. Reload with `task nginx:main:reload` from that repo. Never touch `*/data/` or `sshd_config`.
- `cutover:verify` needs no credentials. It prints one `ok` or `FAIL` line per check.

## OG-D: Bunny dev up

Goal: the root site answers on `https://sh-ocx-dev.b-cdn.net/` and every `cutover:verify` check is green against it.

### Step 1: create the GitHub environments

Create `ocx.sh` and `previews`, each limited to the deployment branch `main`. This is the first step because `bunny:onboard` exits 1 without the `ocx.sh` environment.

```bash
for env in ocx.sh previews; do
  gh api -X PUT "repos/ocx-sh/website/environments/$env" \
    -F 'deployment_branch_policy[protected_branches]=false' \
    -F 'deployment_branch_policy[custom_branch_policies]=true'
  gh api -X POST "repos/ocx-sh/website/environments/$env/deployment-branch-policies" \
    -f name=main -f type=branch
done
```

Verify: `gh api repos/ocx-sh/website/environments/ocx.sh/deployment-branch-policies` lists `main`, and so does the same call for `previews`.

Rollback: `gh api -X DELETE repos/ocx-sh/website/environments/ocx.sh`, and the same for `previews`.

### Step 2: confirm the ocx Home-link PR is merged

The `ocx-sh/ocx` pull request must be merged first. It sets `target: '_self'` on the VitePress Home nav item and sets `logoLink`. Without it, a reader who leaves proxied docs gets the retired landing page from the SPA.

```bash
gh pr list --repo ocx-sh/ocx --state merged --search 'Home nav target _self logoLink'
```

Verify: the pull request is listed as merged. Step 5 checks the result, because `cutover:verify` reads the Home and logo links of a proxied docs page.

Rollback: none here. Do not continue to step 3 until the pull request is merged.

### Step 3: onboard the website repo

Create the deploy secret in the `ocx.sh` environment. The task adopts the existing storage zone `sh-ocx-website`.

```bash
task bunny:onboard -- ocx-sh/website
```

Verify: `gh secret list --env ocx.sh --repo ocx-sh/website` names the Bunny storage key.

Rollback: `gh secret delete <name> --env ocx.sh --repo ocx-sh/website`. The storage zone stays.

### Step 4: apply the dev zone

Reconcile the pull zone, then upsert its edge rules. Look at the dry run before the real apply.

```bash
task bunny:zone:apply -- --zone dev
task bunny:apply -- --zone dev --dry-run
task bunny:apply -- --zone dev
task bunny:verify -- --zone dev
```

Verify: `task bunny:verify -- --zone dev` is green. A differing read-back exits 1 and names the field.

Rollback: check out the previous commit and rerun `task bunny:apply -- --zone dev`. Rule upserts happen before deletes, so no path is ever unrouted.

### Step 5: deploy the root site and verify

Set the variable that switches the deploy on, then dispatch the site workflow.

```bash
gh variable set BUNNY_DEPLOY --body true --repo ocx-sh/website
gh workflow run site.yml --repo ocx-sh/website
gh run watch --repo ocx-sh/website --exit-status \
  "$(gh run list --workflow site.yml --repo ocx-sh/website --limit 1 --json databaseId --jq '.[0].databaseId')"
task cutover:verify -- --host sh-ocx-dev.b-cdn.net
```

Wait for the Deploy job before verifying. `gh run watch` exits 1 when the run fails. If the list still shows the previous run, wait a few seconds and rerun the watch.

Verify: `task cutover:verify -- --host sh-ocx-dev.b-cdn.net` is green. Every response carries `X-Robots-Tag: noindex` on this host.

Rollback: `gh variable delete BUNNY_DEPLOY --repo ocx-sh/website`. The dev zone is not public, so nothing else needs undoing.

## OG-P: prod zone and certificate

Goal: Bunny serves `ocx.sh` with a valid certificate while the public still reaches `pages.dev` through nginx.

### Step 1: apply the prod zone

```bash
task bunny:zone:apply -- --zone prod
task bunny:apply -- --zone prod --dry-run
task bunny:apply -- --zone prod
task bunny:verify -- --zone prod
```

Verify: `task bunny:verify -- --zone prod` is green.

Rollback: check out the previous commit and rerun `task bunny:apply -- --zone prod`.

### Step 2: add the hostname `ocx.sh` to `sh-ocx`

In the Bunny dashboard, add `ocx.sh` as a custom hostname of pull zone `sh-ocx`. Choose the option named `Seamless Domain Migration`. Create the TXT record it shows in the Cloudflare zone of `ocx.sh`. This changes no traffic. Turn on Force SSL when the certificate is active.

Find the address that the rehearsal pins:

```bash
dig +short sh-ocx.b-cdn.net | head -1
```

Verify: the certificate is active in the dashboard, then `task cutover:verify -- --host ocx.sh --resolve <bunny ip>` is green. Its certificate line fails below 30 days left.

Rollback: remove the hostname from the pull zone and delete the TXT record. If the certificate is never issued, stop. OG-N must not run (probe P-C1).

### Step 3: replay the old URLs against prod

The same `--resolve` run replays every URL in `infra/old-urls.txt`. Each must return 200 or exactly one redirect to a 200.

```bash
task cutover:verify -- --host ocx.sh --resolve <bunny ip>
```

Verify: no `FAIL` line. A missed legacy path means a 404 after OG-N. Fix the rules, re-apply dev, then prod, and rerun.

Rollback: as step 2.

## OG-N: nginx upstream to Bunny

Goal: hetzner1 nginx serves `location /` of `ocx.sh` from Bunny, and the registry stays on JFrog. No DNS change and no visitor-facing TLS change happens at this gate.

### Step 1: audit the Cloudflare cache

Nothing at Cloudflare may cache or rewrite Bunny's `Cache-Control`. Confirm all three:

- No cache rule or Edge TTL override applies to `ocx.sh`.
- No page rule applies to `ocx.sh`.
- Browser Cache TTL is "respect existing headers".

```bash
zone=$(cf 'https://api.cloudflare.com/client/v4/zones?name=ocx.sh' | jq -r '.result[0].id')
cf "https://api.cloudflare.com/client/v4/zones/$zone/rulesets/phases/http_request_cache_settings/entrypoint"
cf "https://api.cloudflare.com/client/v4/zones/$zone/pagerules"
cf "https://api.cloudflare.com/client/v4/zones/$zone/settings/browser_cache_ttl"
```

Verify: the cache phase has no rules, the page rule list is empty, and `browser_cache_ttl` has value `0`, which means respect existing headers.

Rollback: none, this step only reads.

### Step 2: rehearse the end state on `next.ocx.sh`

`next.ocx.sh` is a hostname of the prod pull zone `sh-ocx`: a DNS-only CNAME straight to `sh-ocx.b-cdn.net` with a Bunny certificate. It shows what Bunny serves when it answers directly. The registry is not on Bunny, so the `--registry` mode does not apply to this host.

```bash
task cutover:verify -- --host next.ocx.sh
```

Verify: green. The edge rules apply to `Host: next.ocx.sh`. `X-Robots-Tag: noindex` is present, as on a `b-cdn.net` host, so the rehearsal stays out of search engines. HSTS and `X-Frame-Options` appear once each, and no `b-cdn.net` host appears in any `Location`.

Rollback: none, `next.ocx.sh` is not linked from anywhere.

### Step 3: rehearse the nginx hop on `edge.ocx.sh`

Add a throwaway vhost `edge.ocx.sh` on hetzner1. Use a DNS-only A record in Cloudflare and a certificate from `task cert:create DOMAINS=edge.ocx.sh` in `server-hetzner1`. Copy `ocx-sh-00.conf`, set `server_name` to `edge.ocx.sh`, point its certificate paths at the `edge.ocx.sh` certificate, and replace its `location /` with the snippet below. Keep both registry locations as they are. Reload with `task nginx:main:reload`.

The nginx snippet is the ADR 0002 Amendment 1 reference, with the real prod pull zone host:

```nginx
location / {
    set $bunny sh-ocx.b-cdn.net;        # variable: re-resolved via the http-level `resolver`
    proxy_pass https://$bunny;          # no URI part: the request URI passes unchanged
    proxy_set_header Host ocx.sh;       # hostname trigger: ocx.sh rules, never noindex
    proxy_ssl_server_name on;
    proxy_ssl_name ocx.sh;              # SNI; certificate from Seamless Domain Migration (OG-P)
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;  # path per image
    proxy_redirect https://sh-ocx.b-cdn.net/ https://ocx.sh/;          # safety net
    proxy_hide_header Strict-Transport-Security;  # nginx's ssl-security.conf copy stays
    proxy_hide_header X-Frame-Options;            # the server block's copy stays
    # no proxy_cache: Bunny's Cache-Control passes through
}
```

```bash
task cutover:verify -- --host edge.ocx.sh --registry
```

Verify: green. Probe P-N1 holds here: nginx sends `Host: ocx.sh`, so Bunny serves the `ocx.sh` rules with no `X-Robots-Tag`. HSTS and `X-Frame-Options` appear once each, and `/v2/` still answers the JFrog challenge. If nginx cannot verify the `ocx.sh` certificate, use fallback 1 of the ADR: SNI `sh-ocx.b-cdn.net` with `Host: ocx.sh`.

Rollback: remove the `edge.ocx.sh` server block, delete its DNS record, reload nginx. Remove the block after OG-N either way.

### Step 4: switch `ocx.sh`

In the `ocx.sh` server block, replace `location /` with the same snippet and reload.

```bash
task cutover:verify -- --host ocx.sh --registry
```

Verify: green through the public path. Then watch for 48 hours. Read the nginx and Bunny logs, and Search Console.

Rollback: revert `location /` to `ocx-website.pages.dev` and reload nginx. The previous block is in the git history of `server-hetzner1`. The change takes seconds and needs no DNS change or certificate.

## OG-V: preview zones

Goal: each consumer preview site builds to its own Bunny zone at `https://sh-ocx-preview-<slug>.b-cdn.net/`. Production zones stay untouched. The sites are `ocx`, `rules-ocx`, `python-sdk` and `catalog`. Repeat steps 1 and 2 for each, then deploy once in step 3. The full per-zone form is in the [Bunny runbook](../bunny/README.md#og-v-preview-zones).

### Step 1: onboard a preview site

```bash
task bunny:onboard -- --preview <site>
```

Verify: `gh secret list --env previews --repo ocx-sh/website` names the site's key. A missing secret makes its deploy step exit 1 with zero requests.

Rollback: `gh secret delete <name> --env previews --repo ocx-sh/website`.

### Step 2: bring the preview zone up

The zone argument takes the slug, which has no underscore: `preview:rules-ocx`, not `preview:rules_ocx`. Without this step the preview host does not exist and the deploy has nothing to serve.

```bash
task bunny:zone:apply -- --zone preview:<slug>
task bunny:apply -- --zone preview:<slug>
```

Verify: both tasks end with `read back equal`.

Rollback: check out the previous commit and rerun both tasks. Delete a preview zone in the dashboard only.

### Step 3: deploy the previews

```bash
gh variable set PREVIEWS_DEPLOY --body true --repo ocx-sh/website
gh workflow run previews.yml --repo ocx-sh/website
task bunny:verify -- --zone preview:<slug>
```

Verify: `task bunny:verify -- --zone preview:<slug>` is green for each site, and every response carries `noindex`.

Rollback: `gh variable delete PREVIEWS_DEPLOY --repo ocx-sh/website`.

## OG-C: apex DNS flip (deferred)

Run this at the end of 2026, after the registry has left hetzner1. It moves the apex to Bunny and removes nginx from the HTML path. It needs OG-N done and a registry-free hetzner1.

### Step 1: audit Cloudflare and record the SSL mode

Every Cloudflare rule scoped to `ocx.sh` stops applying once the apex record is DNS-only. List them all, and decide for each whether Bunny must replace it. Keep Universal SSL on, so a restored record has a certificate. Record the SSL mode in the pull request or log that closes this step.

```bash
zone=$(cf 'https://api.cloudflare.com/client/v4/zones?name=ocx.sh' | jq -r '.result[0].id')
cf "https://api.cloudflare.com/client/v4/zones/$zone/settings/ssl"
```

Verify: the SSL mode is written down, and the rule list is reviewed.

Rollback: none, this step only reads.

### Step 2: export the Cloudflare zone

```bash
mkdir -p .tmp
cf "https://api.cloudflare.com/client/v4/zones/$zone/dns_records/export" > .tmp/ocx.sh.zone
```

Verify: the BIND file lists the `MX` and `TXT` records of `infra/cutover/dns-baseline.json`. The file stays in the gitignored `.tmp/`.

Rollback: this file is the rollback input for step 5.

### Step 3: renew the hetzner1 certificate and record its expiry

After the flip, the HTTP-01 challenge for `ocx.sh` lands on Bunny, so the hetzner1 certificate stops renewing. Under Cloudflare Full (strict), a restored proxied record then answers 526. Renew the certificate on hetzner1 right before the flip, by its HTTP-01 webroot flow in `server-hetzner1`. Record the new expiry date as the rollback deadline.

```bash
echo | openssl s_client -connect <hetzner1 ip>:443 -servername ocx.sh 2>/dev/null \
  | openssl x509 -noout -enddate
```

Verify: the `notAfter` date is at least 60 days away, and the date is written down as the rollback deadline.

Rollback: rollback deadline: the recorded expiry. After it, rollback starts with a DNS-01 re-issue of the certificate. An ACME edge rule on Bunny is not an option.

### Step 4: rerun the `--resolve` rehearsal

```bash
task cutover:verify -- --host ocx.sh --resolve <bunny ip>
```

Verify: green, with more than 30 days left on the Bunny certificate. If it fails, stop and do not flip.

Rollback: none, this step only reads.

### Step 5: flip the apex

In Cloudflare, set the apex to a DNS-only CNAME to `sh-ocx.b-cdn.net` with TTL 60 seconds. Run the check from the public internet.

```bash
task cutover:verify -- --host ocx.sh --dns
```

Verify: green, with `MX` and `TXT` unchanged. Then watch for 48 hours. No `ocx.sh` HTML request may reach hetzner1.

Rollback: restore the records from the exported zone `.tmp/ocx.sh.zone`. Traffic returns within 60 seconds. This works only before the recorded rollback deadline.

## OG-T: retire hetzner1 (deferred)

Run this two stable weeks after OG-C. It needs the rollback deadline to be irrelevant, so nothing may still depend on a rollback.

### Step 1: raise the TTL and retire hetzner1

Raise the apex TTL to 1 hour. Run probe P-C3 for the Bunny region choice. Retire hetzner1 once its nginx logs show no `ocx.sh` traffic.

```bash
task cutover:verify -- --host ocx.sh --dns
```

Verify: green, and the nginx logs on `ssh hetzner` show no `ocx.sh` requests.

Rollback: as OG-C step 5, within the certificate deadline.
