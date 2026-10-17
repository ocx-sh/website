/**
 * Prefix a base-relative, root-absolute `path` with the site base, with or without a trailing slash on
 * `base`: `/casts/x.cast` under `/docs/` or `/docs` becomes `/docs/casts/x.cast`. It always prefixes
 * (no "already under the base" guess: base `/index/` and path `/index/x` is `/index/index/x`), so
 * callers pass base-relative paths. A relative path, a protocol-relative or a full URL is returned unchanged.
 * @param {string} path
 * @param {string} base `import.meta.env.BASE_URL` / `base` from `astro:config/client`
 * @returns {string}
 */
export function withBase(path: string, base: string): string;
