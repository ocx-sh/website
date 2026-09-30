# hex memory — ocx-website

Short, pointer-only. Project context lives in `AGENTS.md` and `HANDOVER.md`.

## Pointers

- Verification: `AGENTS.md` › Commands — `ocx exec -- task check` (lint,
  typecheck, test, build). Live review: `ocx exec -- task dev`.
- Product context and settled decisions: `HANDOVER.md`.
- Plans: `.agents/plans/plan_<topic>.md`. ADRs: `.agents/adr/adr_<NNNN>_<topic>.md`.
  Research: `.agents/research/`. All committed.
- Owner inputs (design export, pulled samples): `.tmp/` (gitignored).
- Key rules: `.claude/rules/` (grim-installed: css-theming, typescript-quality,
  typescript-packaging, docs-quality).
- Worktrees: `.agents/worktrees/` (gitignored).

## Preferences

- adversary: nox-review
- models: follow the owner's global model routing (explore/research sonnet;
  architect, review, non-mechanical build opus).

## Memory

- Active plan: `.agents/plans/plan_website-buildout.md` (plan-approved, 2026-09-27). ADR: `.agents/adr/adr_0001_ocx-site-architecture.md`.
