# Goal: "ocx theme framework with Zag-backed components"

Source: .agents/discussions/website-buildout.md · Written: 2026-09-27 by /hex-loop

## Definition of done

- [x] "Stage A done: WP11b and WP14 merged; task check, e2e, lighthouse and pack green" — evidence: Stage A merged (WP11b 2f211c4, WP14 315e10c); gates green again on the merged tip 88482e4+ and finally on 0aaafa2/485b86a: check, e2e 643, lighthouse 38×100×4, pack OK. Re-verified after the owner-findings batches on 2026-09-29 (tip c45f446 series): check, e2e 757 passed, lighthouse 52 URLs 100×4, pack, visual 0 site-unavailable.
- [x] "Zag Tier A machines plus search, sidebar and mobile menu adopted per the research" — evidence: Z0–Z14 merged (plan_zag-adoption.md State: review, 725e4a7); search Z10 1ad3db2, sidebar + mobile drawer Z12 4af5bed, List/listbox + async-list Z14 0aaafa2.
- [x] "Zag supplies only behaviour: our API, markup and token CSS stay; first paint is final, no flicker" — evidence: SSR-vs-connect tests (expectSsrMatchesConnect), first-paint and images-blocked e2e, lazy mount on interaction (AGENTS.md Zag rule), all green on 0aaafa2.
- [x] "task dev has a clickable showcase page per component, like Zag's examples, covering every state; a test fails on a missing one" — evidence: one showcase page per component with states and event log (Z2 9d03249 + each Z-WP); showcase-coverage and showcase-shape tests fail on a missing page.
- [x] "Memory-optimized: JS heap and DOM size are budgeted and enforced in the gate" — evidence: tests/budgets.mjs heap 3.45/4 MiB and DOM 609/800 on content pages plus leak helper, enforced in task e2e; green on 0aaafa2.
- [x] "Performance-optimized: page weight and JS budgets enforced; Lighthouse 100 x4 on every example page" — evidence: postJsGz chrome 56.8/64 KiB, preJsGz 9.5/11 KiB, htmlGz 13.8/14.2 kB, pagefind 51.5/58 KiB enforced in task e2e/lighthouse; Lighthouse 38 URLs 100×4.
- [x] "The packed tarball installs into a fresh consumer fixture and renders every exported component" — evidence: task pack consumer fixture renders every exported component via copied showcase pages (Z2); green on 485b86a.
- [ ] "Components follow the live OCX design project; gaps are design questions in the PR" — evidence: the commit, PR comment or artifact that satisfies it.
- [ ] PR merge-ready (DONE block only) — evidence: the PR URL, and the
  PR is not a draft.
- [ ] CI green per job (DONE block only) — evidence: every check run on
  the PR head SHA with its conclusion; every skipped job states its
  skip reason (its `if:` or path filter).
  A skip with no reason is not green.
- [ ] Deep verify passed (DONE block only) — evidence: the full documented verification result.

## Blocker record (2026-09-29)

- Question: criteria 8–11 need a PR, CI and deep verify. Research: `git remote -v` is empty; the
  repo `ocx-sh/website` does not exist, and creating a repo is outside the I9 grants (issues and
  PRs need the remote too). Decision: stop with DONE under I11's "no unmet criterion can progress
  without an ungranted act or a human"; the owner creates the remote, then /hex-finalize runs.
- Design questions live in `.agents/plans/plan_zag-adoption.md` (DQ1–DQ16 + "Owner findings
  2026-09-28"); they move into the PR body at /hex-finalize.
- Open owner decisions: licence (DQ15), elvish icon (no single-colour licensed source).

## Autonomy

- Prompting: never — no question waits for a human; a doubt runs
  § Issue resolution.
- Granted acts (authority: the pasted prompt): none
- Forbidden or narrowed acts: None.

## Issue resolution

Every doubt — an ambiguous requirement, a design question, a failure
with an unclear cause — runs this protocol:

1. Delegate the research to a sub-orchestrator.
2. Record question → research → decision in this file or in the PR.
3. Defer to a GitHub issue only in hard cases — the research ends with no
   decision, or the decision needs an act outside the grants; the issue
   link is the recorded decision.
4. Every doubt not deferred ends in an action.
5. A pre-existing failure that blocks done is in scope and runs this
   protocol.
6. Findings outside this goal's scope become follow-up issues.
7. Secrets and credential-bearing logs are never written to any committed
   file, commit message, PR text, PR comment or review comment, or issue.
   Security findings are never filed as issues:
   this file records them by reference only — location and class, no
   secret value or exploit detail — and only the DONE block reports them
   in full.

## Loop shape

- Entry point: Run the /hex-plan skill on "ocx theme framework with Zag-backed components, per .agents/discussions/website-buildout.md".
- Refinement rounds: 2 — counts outer cycles: each review ⇄ execute
  pass is one, and so is every failed repair or retry cycle — a local
  verify failure, an execute or finalize retry, a post-finalize CI fix ⇄
  re-finalize pass. Inner review-fix rounds do not count, and their limit
  is untouched.
  Past `2`, the DONE block reports every remaining criterion `not met`
  and the run stops.
- Ticks: /hex-loop commits nothing. The session creates or switches to
  the branch the pasted prompt's I9 names and commits this file first on
  it. A box is ticked only between hex-mode runs, never during one, and
  each tick is committed at once; every tick lands before the final
  /hex-finalize, none after it. The `(DONE block only)` criteria are
  evidenced only in the closing DONE block, never ticked.

## Rules

None.

## Emphasis

None.

## Context

- Source discussion: `.agents/discussions/website-buildout.md` (requirements, decisions, open questions with recommended answers).
- Active plan: `.agents/plans/plan_website-buildout.md`; ADR `.agents/adr/adr_0001_ocx-site-architecture.md`; design record `.agents/adr/design_ocx-site.md`.
- Research: `.agents/research/zag-adoption.md`, `.agents/research/ocx-components-port.md`, `.agents/research/ui-primitives.md`.
- Live design project: https://claude.ai/design/p/550606f7-5b74-4164-b5e9-6a2e5b27cafe (export in `.tmp/design/`).
