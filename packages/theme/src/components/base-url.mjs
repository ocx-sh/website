// Site-base URL joining shared by the components (Terminal casts, DependencyExplorer data).

/**
 * Resolve a root-absolute `path` against the site base, with or without a trailing slash on `base`:
 * `/casts/x.cast` under `/docs/` or `/docs` becomes `/docs/casts/x.cast`. A path already under the base,
 * a relative path, a protocol-relative or a full URL is returned unchanged.
 * @param {string} path
 * @param {string} base `import.meta.env.BASE_URL` / `base` from `astro:config/client`
 * @returns {string}
 */
export function withBase(path, base) {
  const b = base.endsWith('/') ? base : `${base}/`;
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith(b)) return path;
  return b + path.slice(1);
}
