# hex memory — ocx-website

Short, pointer-only. Project context lives in `AGENTS.md` and `HANDOVER.md`.

## Pointers

- Verification: `AGENTS.md` › Commands — `ocx exec -- task check`, then
  `task e2e`, `task lighthouse`, `task pack` one at a time (the host OOMs).
  Live review: `ocx exec -- task dev`.
- Hub files: `pnpm-lock.yaml` — regenerate at integration only.
- Fresh gate: `LH_NO_CACHE=1 ocx exec -- task lighthouse` (plus `task check`).
- Retro: `.agents/retro/`.
- Product context and settled decisions: `HANDOVER.md`.
- Plans: `.agents/plans/plan_<topic>.md`. ADRs: `.agents/adr/adr_<NNNN>_<topic>.md`.
  Research: `.agents/research/`. All committed.
- Owner inputs (design export, pulled samples): `.tmp/` (gitignored).
- Key rules: `.claude/rules/` (grim-installed: css-theming, typescript-quality,
  typescript-packaging, docs-quality).
- Worktrees: `.agents/worktrees/` (gitignored).

## Preferences

- Models: standard default; deep only for a new one-way-door architect.

## Memory

- Active plan: `.agents/plans/plan_website-buildout.md` (review; Stage A merged, Stage B phase 2 pipelines merged and gated 2026-10-04, next /hex-finalize; WP7d waits for M0). ADRs: `adr_0001_ocx-site-architecture.md`, `adr_0002_phase2-bunny-cutover.md`. Research: `.agents/research/phase2_{bunny,deploy,cutover}.md`.
