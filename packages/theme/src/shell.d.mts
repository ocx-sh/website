/** The swappable parts of the header, each a `<template data-shell-part="<name>">` of the fragment. */
export const SHELL_PARTS: readonly ["sections", "mega", "drawer"];
/** Where the root site publishes the pointer (`current.json`) and the rev-addressed fragments (`<rev>/nav.html`). */
export const SHELL_DIR: "/_shell/v1/";
/** Hosts that serve `SHELL_DIR`; elsewhere (localhost, CI previews) the loader stays off, so no 404 reaches the console. */
export const SHELL_HOST: RegExp;
/** A rev: the first 12 hex characters of the fragment's SHA-256. */
export const SHELL_REV: RegExp;
