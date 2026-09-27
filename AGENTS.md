# AGENTS.md

Project context for every AI agent in this repo. `CLAUDE.md` only imports this
file; edit here.

## What this repo is

`ocx-sh/website`: the shared theme library `@ocx-sh/theme`, the root site for
`ocx.sh` (`/`, `/integrations/`, `/apps/`, `/install/`), and the reusable Bunny
deploy action every section repo calls. Stack: Astro + Starlight, TypeScript,
npm.

**[HANDOVER.md](HANDOVER.md) holds the settled decisions, repo layout, phases
and open questions. Read it before any design or code change.** Research trail:
`docs/research/`. Local design draft export (gitignored, may be absent):
`.tmp/design/`.

## Working here

- Current phase: 1, the library (`packages/theme/`). Do not touch consumer
  repos before it is published.
- Tokens only, never raw values; colour is the only per-scheme token family.
  Rules: `css-theming`, `typescript-quality`, `typescript-packaging`,
  `docs-quality`.
- No Web Awesome, no mdBook/MkDocs adapters (see HANDOVER "Draft items").
- Quality bar: Lighthouse 100 in all four categories; shared components typed
  and tested (Vitest + Astro Container API, Playwright under a non-root `base`).

## Commands

Tools come from `ocx.toml`; run everything through it: `ocx exec -- task <name>`.

- `task dev` — live-reload Starlight example at http://localhost:4321/docs/,
  wearing `packages/theme` straight from source. Pulls samples on first run.
- `task samples` — refresh real pages from consumer repos (`--offline` reuses
  the cache in `.tmp/samples/`).
- `task check` — the gate: lint, typecheck, test, build. CI calls only this.

## Agent config

Skills and rules are installed by grim from `grimoire.toml`, pinned in
`grimoire.lock`, and committed. Change them with `grim add` / `grim update`,
never by hand-editing the installed copies.
