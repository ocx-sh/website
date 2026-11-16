---
title: Glossary terms
description: The twelve terms of this site's glossary, generated from its data file.
tableOfContents:
  maxHeadingLevel: 2
---

## OCX {#ocx}

### OCX home {#ocx-home}

The directory where OCX keeps its stores, local index, state and global toolchain: `$OCX_HOME`, or `~/.ocx` when unset.

See [Glossary](/docs/components/glossary/).

## OCI {#oci}

### descriptor {#descriptor}

A small JSON record inside an OCI manifest that names other content by media type, digest and size.

See [Glossary](/docs/components/glossary/).

### image index {#image-index}

An OCI manifest that lists one platform manifest per platform under a single tag, so each host picks its own build.

See [Glossary](/docs/components/glossary/).

## Signing {#signing}

### cosign {#cosign}

Sigstore's command-line signing tool; OCX signatures and attestations interoperate with it.

See [Glossary](/docs/components/glossary/).

### Fulcio {#fulcio}

Sigstore's certificate authority: it exchanges an OIDC token for a short-lived X.509 certificate naming the signer identity.

See [Glossary](/docs/components/glossary/).

### Rekor {#rekor}

Sigstore's append-only transparency log; each logged signature gets a Signed Entry Timestamp that verifiers check.

See [Glossary](/docs/components/glossary/).

### SBOM {#sbom}

Software bill of materials: a list of the components inside a package, attached to it as a referrer.

See [Glossary](/docs/components/glossary/).

### Sigstore {#sigstore}

An open signing service: Fulcio issues short-lived certificates, Rekor logs every signature, and verifiers check both.

See [Glossary](/docs/components/glossary/).

## Publishing {#publishing}

### cascade {#cascade}

Moving a new release's rolling tags along with it, so pushing `3.28.1` also moves `3.28`, `3` and `latest`.

See [Glossary](/docs/components/glossary/).

### rolling tag {#rolling-tag}

A tag such as `3.28`, `3` or `latest` that moves forward to the newest matching release.

See [Glossary](/docs/components/glossary/).

## Platform {#platform}

### semver {#semver}

Semantic Versioning: versions written `MAJOR.MINOR.PATCH`, where each part signals breaking, additive or fix changes.

See [Glossary](/docs/components/glossary/).

## Project {#project}

### global toolchain {#global-toolchain}

The user-wide `ocx.toml` and `ocx.lock` in the OCX home, reached only with `--global` and never mixed into a project.

See [Glossary](/docs/components/glossary/).
