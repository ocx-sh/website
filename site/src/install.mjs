// The five shells' install commands: the one source for the landing page and `/install/` (C-306, C-307).
// Verbatim from the live ocx site: ocx/website/src/index.md (Quick Install) and docs/installation.md.

/** @type {string} */
export const sh = 'curl -fsSL https://setup.ocx.sh/sh | sh';
/** @type {string} */
export const pwsh = "Invoke-RestMethod 'https://setup.ocx.sh/pwsh' | Invoke-Expression";
/** @type {string} */
export const nu = 'curl -fsSL https://setup.ocx.sh/nu | nu';
/** @type {string} */
export const fish = 'curl -fsSL https://setup.ocx.sh/fish | fish';
/** @type {string} */
export const elvish = 'curl -fsSL https://setup.ocx.sh/elvish | elvish';
