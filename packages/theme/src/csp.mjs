// CSP script hashes for the inline scripts Shell, SiteHeader and SiteFooter emit (Shell's theme and
// platform scripts; the header and footer emit none). Computed from the very constants the chrome renders,
// so they cannot drift; csp.test.ts renders Shell and fails on an inline script without a hash here.
// Shell's bundled `<script>` (chrome.mjs) is a module script: allow it by `'self'`, or by its own hash
// if your build inlines it (or set vite `build.assetsInlineLimit: 0`). Node-only: never import client-side.
import { createHash } from 'node:crypto';
import { PLATFORM_SCRIPT, THEME_SCRIPT } from './head-scripts.mjs';

/** `sha256-<base64>` source expression of one inline script's text. @param {string} text */
const hash = (text) => `sha256-${createHash('sha256').update(text).digest('base64')}`;

/** @type {readonly string[]} the `script-src` hash sources, without quotes: wrap each in `'…'` */
export const INLINE_SCRIPT_HASHES = Object.freeze([THEME_SCRIPT, PLATFORM_SCRIPT].map(hash));
