// The shared origin-leak check of `bunny:verify` and `cutover:verify`.

/** @typedef {{ headers: Record<string, string | string[]>, body: string }} Response header names in any case */
/** @typedef {{ where: string, value: string }} Finding `header:<name>`, `canonical`, `og:url` or `body`, and the offending text */

/**
 * Findings for a proxied response: a `pages.dev` or `github.io` host in `Location`, `Link`,
 * `Content-Location`, a `Set-Cookie` domain, `<link rel=canonical>` or `og:url`, or the literal
 * `ocx-website.pages.dev` (any case) anywhere in the body. A third-party `*.github.io` link in the body is not one.
 * @param {Response} response
 * @returns {Finding[]}
 */
export function findLeaks({ headers, body }) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {string} */ where, /** @type {string} */ text) => {
    for (const host of text.match(ORIGIN_HOST) ?? []) findings.push({ where, value: host });
  };

  for (const [rawName, raw] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    for (const value of [raw].flat()) {
      if (name === 'set-cookie') {
        for (const [, domain] of value.matchAll(/;\s*domain\s*=\s*([^;]*)/gi)) add(`header:${name}`, domain ?? '');
      } else if (WATCHED.has(name)) {
        add(`header:${name}`, value);
      }
    }
  }

  for (const [tag] of body.matchAll(/<(?:link|meta)\b[^>]*>/gi)) {
    const attr = (/** @type {string} */ n) => tag.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
    if (/^canonical$/i.test(attr('rel') ?? '')) add('canonical', attr('href') ?? '');
    if (/^og:url$/i.test(attr('property') ?? '')) add('og:url', attr('content') ?? '');
  }

  if (body.toLowerCase().includes(ORIGIN_LITERAL)) findings.push({ where: 'body', value: ORIGIN_LITERAL });
  return findings;
}

const WATCHED = new Set(['location', 'link', 'content-location']);
const ORIGIN_LITERAL = 'ocx-website.pages.dev';
// Whole-label match: `notpages.dev` and `github.io.example` are not origin hosts.
const ORIGIN_HOST = /(?<![a-z0-9-])(?:[a-z0-9-]+\.)*(?:pages\.dev|github\.io)(?![a-z0-9-])(?!\.[a-z0-9])/gi;
