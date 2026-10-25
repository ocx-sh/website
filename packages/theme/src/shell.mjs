// The live header's contract (r10): shared by the fragment build (`site/`), SiteHeader's `data-nav-rev`
// and the loader in chrome.mjs, so none of them restates a name. Browser-safe: the Node half (rev, render)
// is shell-rev.mjs. A future incompatible markup change goes to `/_shell/v2/` with a theme release.

/** The swappable parts of the header, each a `<template data-shell-part="<name>">` of the fragment. */
export const SHELL_PARTS = /** @type {const} */ (['sections', 'mega', 'drawer']);

/** Where the root site publishes the pointer (`current.json`) and the rev-addressed fragments (`<rev>/nav.html`). */
export const SHELL_DIR = '/_shell/v1/';

/** Hosts that serve `SHELL_DIR`; elsewhere (localhost, CI previews) the loader stays off, so no 404 reaches the console. */
export const SHELL_HOST = /(?:^|\.)ocx\.sh$/;

/** A rev: the first 12 hex characters of the fragment's SHA-256. */
export const SHELL_REV = /^[0-9a-f]{12}$/;
