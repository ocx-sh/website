---
title: Pinning tools for a project
description: A long guide to pinning the tools a project needs in ocx.toml, resolving them offline, and keeping every machine on the same versions.
---

This page is the long-document fixture for `task lighthouse` (C-057). It reads
like a real guide so the audit sees the same shape a long doc renders: many
headings, a table of contents, paragraphs, lists and code.

## Why pin tools

A project that builds on one machine and fails on another usually differs in
one small way: a compiler, a runtime or a formatter moved a minor version.
Pinning each tool in the repository removes that difference. Every checkout
resolves the same version, and a version change becomes a reviewed commit
rather than a surprise on a Monday morning.

Pinning also makes onboarding short. A new contributor clones the repository,
runs one command, and has every tool the build needs, at the versions the build
was tested with. Nothing is installed globally, so two projects that need
different versions of the same tool never collide.

## Declare the tools

Tools live in `ocx.toml` at the repository root. Each entry maps a short name to
a package reference: a registry, a repository and a tag.

```toml title="ocx.toml"
#:schema https://ocx.sh/schemas/project/v1.json

[tools]
node = "ocx.sh/nodejs/node:24"
pnpm = "ocx.sh/pnpm/pnpm:11"
task = "ocx.sh/go-task/task:3"
```

The tag can be as loose or as strict as the project needs:

- A major tag such as `24` follows every compatible release.
- A minor tag such as `24.19` follows patch releases only.
- A full version such as `24.19.0` never moves.
- A digest pins the exact bytes, whatever the tag later points at.

### Choosing a tag

Start with major tags. They keep the file readable and pick up security fixes
without a commit. Tighten a tag only when a release breaks the build, and
record why next to the entry so the next reader knows when it can loosen again.

### Locking the result

The lock file records the digest each tag resolved to. Commit it. A lock file
turns a loose tag into a reproducible build: every machine installs the digest
in the lock, not whatever the tag points at today.

## Run through the toolchain

Commands run inside the pinned environment with `ocx exec`. The tools from
`ocx.toml` come first on `PATH`, so the build never picks up a stray global
install.

```sh
ocx exec -- task check
```

Wrap every entry point this way: local scripts, editor tasks and continuous
integration. When all three call the same command, a green local run predicts
a green pipeline.

## Work offline

Packages are content-addressed and cached locally after the first resolve.
Once the cache holds every digest in the lock file, installs need no network at
all. This matters on a train, behind a strict proxy, and in build sandboxes
that deny outbound traffic by design.

1. Resolve once while online, so the cache holds every locked digest.
2. Commit the lock file, so every machine asks for the same digests.
3. Run with the offline flag, so a missing digest fails fast instead of
   reaching for the network.

## Update deliberately

Updating a tool is a normal change: edit the tag or refresh the lock, run the
checks, and open a pull request. Reviewers see exactly which tool moved and by
how much. If the new version breaks something, reverting the commit restores
the old one everywhere.

### Batch or one at a time

Update one tool per change when the tool is central to the build, such as the
compiler or the runtime. Batch the small ones, such as linters and formatters,
into a single routine refresh. Either way, let the checks decide, not the
calendar.

## Troubleshooting

Most problems fall into a few groups:

- **A tool is not found.** The command ran outside `ocx exec`, so the pinned
  tools were never on `PATH`.
- **The version is wrong.** A global install shadows the pinned one in a
  shell profile; remove it or run through `ocx exec`.
- **Offline install fails.** The cache is missing a digest from the lock file;
  resolve once while online.

## Summary

Declare every tool in `ocx.toml`, commit the lock file, and run every entry
point through `ocx exec`. The result is one set of versions on every machine,
changed only by reviewed commits.
