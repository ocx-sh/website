---
title: Glyph probe
description: A page with accented letters, a euro sign and a section sign, to prove the on-demand Plex font files load for characters outside the core set.
---

This page is a fixture for `tests/e2e/fonts.spec.ts`. Its text has characters
outside the preloaded core font: café, Zürich, año, Straße, €5 and §3. The
browser fetches the matching rest file only for a page like this one.
