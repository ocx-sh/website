---
title: Publish a package
description: An outline of five sections and seven subsections, the fixture of the folding "On this page" outline.
---

This page shows the folded outline (`foldOutline`, on by default): at 10 rows or more, the "On this page" list folds
each section's subsections under its title, and the section being read opens as the page scrolls. Its shape, five
sections and seven subsections, is a consumer guide's; `tests/e2e/toc-fold.spec.ts` and the DOM measurement read it.

## Prepare the archive

A package is one archive per platform, plus the metadata that says how to install it. Build each archive on the
platform it targets, or cross-compile and check the result on that platform before you push. An archive that only
unpacks on the machine that built it is the most common reason a first publish fails.

Keep the build that produces the archives in the repository, next to the code. A release is then a commit and a tag:
anyone can rebuild the same archive from the same commit, and a reviewer can read how it was made.

### Lay out the tree

Put the binaries under `bin/` and anything they load next to them. The archive root is the install root, so a file
at `bin/tool` ends up at `bin/tool` inside the package's install directory. Keep paths relative: an absolute path
in a script breaks as soon as the package installs somewhere else.

Leave out what the tool never reads at run time: test fixtures, build caches, editor files. Each one is bytes every
reader downloads and a file name a reader may mistake for part of the tool.

### Write the metadata

The metadata names the entry points and the environment the package exports when it is installed. Declare every
variable the tool needs at run time, and nothing the build needed only once. A variable the metadata leaves out is
one the reader has to set by hand.

Name an entry point after the command a reader types. If the archive holds several tools, declare each one: a tool
the metadata does not name is not on the reader's `PATH`, even though its file is in the archive.

## Push the package

Pushing uploads every platform's archive and one index that ties them to a single tag. The push is one transaction
from the reader's side: a pull sees the old index or the new one, never a mix. Push from CI, where the build that
produced the archives also produces the provenance.

A failed push leaves nothing half-published. Fix the cause and push again with the same tag; the archives that made
it the first time are not uploaded twice.

### Pick the tag

Tag a release with its full version. A rolling tag such as `24` follows the newest release in its line, so readers
who pin a major version pick up patch releases without a change on their side. Never move a full-version tag.

Push the rolling tags after the full version, in the same job. A reader who resolves `24` between the two pushes then
gets the previous release, not a broken one.

### Authenticate

The registry takes the same credentials as `docker login`. In CI, use the job's short-lived token rather than a
personal one: it expires with the job and names the workflow that pushed.

Give the token write access to the one repository it pushes to and nothing else. A leaked token can then overwrite
one package at most, and the registry's log names the job that held it.

## Describe it

A description is a page of Markdown and a logo, shown in the catalog next to the package. It is pushed on its own,
so fixing a typo does not need a new release. Lead with what the tool does and the command that runs it.

Write it for a reader who has never heard of the tool: one paragraph on what it is for, one command that shows it
working, and a link to its own documentation for everything else.

### Add a logo

A square SVG reads best at the catalog's small sizes. Keep it under 2 KB, with no embedded raster images, and test it
on a dark background as well as a light one.

Use the project's own mark. A logo drawn for the catalog alone confuses readers who know the tool by its usual one.

## Announce it

An index entry makes the package findable. Announce it once the smoke test passes, and link the description from the
release notes so readers land on the page that explains the tool.

## Verify the result

Pull the package on a clean machine and run its entry point once. A clean machine is the only place a missing file
shows up: your own has every library the build left behind.

A CI job on a fresh runner is a clean machine that costs nothing to repeat. Run the check there after every push, so
a broken release is found before a reader finds it.

### Check the digest

The digest the push printed must match the one a pull resolves. A mismatch means another push moved the tag in
between, or a mirror serves a stale index.

Record the digest in the release notes. A reader who pins it gets exactly the bytes you checked, whatever the tag
points at later.

### Run the smoke test

`ocx package test` runs the package's own check in a fresh environment. It installs the package exactly as a reader
would, then runs the command the metadata names as its test.

Keep the test short and offline: print the version, run one real command on a fixture. A test that needs the network
fails for reasons that have nothing to do with the package.

Run the test on every platform the package ships for. An archive that installs on Linux and fails on macOS is a
broken release for half the readers, and only a run on macOS shows it.

Keep the test in the repository next to the build, so a change to the package and a change to its check land in the
same commit and a reviewer reads both.

Run it again after every rolling-tag push. A rolling tag points readers at new bytes without a change on their side,
so the check is the one place a regression shows before they pull it.

When the test fails after a push, withdraw the release by moving the rolling tags back, not by deleting the full
version. Readers who pinned the full version keep what they had, and new readers get the last good release.

Record the result next to the digest in the release notes. A reader who wants to know whether a version was checked
then finds the answer where they found the version.
