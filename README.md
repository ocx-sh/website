<!-- doc_type: readme -->

# ocx-sh/website

Shared theme library (`@ocx-sh/theme`), root site and deploy action for the unified OCX site at ocx.sh.

Status: the library shipped as `v0.1.0`. The root site (`site/`), Bunny as code (`infra/bunny/`), the deploy action and the cutover suite (`infra/cutover/`) are in progress. Consumer repos migrate after that.

Start with [HANDOVER.md](HANDOVER.md) for the settled decisions and [AGENTS.md](AGENTS.md) for the commands. Run everything through the toolchain: `ocx exec -- task <name>`.

- `task check` is the gate. `task dev` and `task site:dev` run the showcase and the root site.
- [`RELEASING.md`](RELEASING.md) covers releases.
- [`infra/bunny/README.md`](infra/bunny/README.md) and [`infra/cutover/README.md`](infra/cutover/README.md) are the owner runbooks for Bunny and the `ocx.sh` cutover.
