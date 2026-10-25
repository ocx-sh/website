// The live header's rev (r10): a fragment is named by its content, so a rev directory never changes.
// Node-only, and free of Astro, so a config-time integration can import it.
import { createHash } from 'node:crypto';

/**
 * The rev of a rendered fragment: the first 12 hex characters of its SHA-256.
 * @param {string} html
 * @returns {string}
 */
export const shellRev = (html) => createHash('sha256').update(html).digest('hex').slice(0, 12);
