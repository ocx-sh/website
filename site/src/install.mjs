// The five shells' install commands: the one source for the landing page (C-306; `/install/` moved to ocx-sh/www-setup).
// Source of truth: the ocx-sh/www-setup README. nu and elvish read a script from stdin only as a REPL, so they get
// the text through `-c`, and a failed download becomes `exit 3` instead of running nothing.

/** @type {string} */
export const sh = 'curl -fsSL https://setup.ocx.sh/sh | sh';
/** @type {string} */
export const pwsh = "Invoke-RestMethod 'https://setup.ocx.sh/pwsh' | Invoke-Expression";
/** @type {string} */
export const nu = `nu -c "$(curl -fsSL https://setup.ocx.sh/nu || echo 'exit 3')"`;
/** @type {string} */
export const fish = 'curl -fsSL https://setup.ocx.sh/fish | fish';
/** @type {string} */
export const elvish = `elvish -c "$(curl -fsSL https://setup.ocx.sh/elvish || echo 'exit 3')"`;
