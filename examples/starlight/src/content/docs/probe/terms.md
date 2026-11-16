---
title: Signing a release
description: Consumer-shaped content page that links glossary terms, the script budget fixture for what the glossary costs a page.
---

This page exists for `tests/e2e/glossary-cost.spec.ts`: the same shape as `probe/long` with terms in its
prose, so the glossary's pre-interaction cost shows against it. Do not link it from navigation.

## Sign with Sigstore

A release is signed with Sigstore, and its certificate comes from Fulcio. Every entry lands in Rekor, so a
reader can check the signature long after the build.

:::note[How a rolling tag moves]
Publishing under a rolling tag keeps the newest build reachable, and a cascade moves that tag when a new
patch ships.
:::

```sh
ocx lock
```

## Keep the archive stable

Entries are sorted by filename, so directory iteration order does not leak in. The descriptor of each layer
names its digest, and a reader verifies it before it unpacks anything.

## Check it offline

Verification needs no network once the bundle is next to the archive.
