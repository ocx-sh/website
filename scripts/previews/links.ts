// Consumer pages link to each other as `other.md` files (VitePress, MkDocs); Starlight serves `/other/`. Rewrites
// those links, inline and reference-style, to the page's route so the preview navigates. Everything else is left
// alone: external and anchor links, links that leave the docs tree, and anything inside a code fence.
import { posix } from 'node:path';

const INLINE = /\]\(<?([^)\s>]+)/g;
const DEFINITION = /^(\s{0,3}\[[^\]]+\]:\s*<?)(\S+?)(?=>?\s*$)/;

/** The route a `.md` link target names, keeping its `#fragment`/`?query`; the target itself when it is not one. */
function route(target: string, page: string): string {
  const m = /^([^#?]+)\.mdx?([#?].*)?$/.exec(target);
  if (!m || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) return target;
  const path = m[1]!.startsWith('/') ? posix.normalize(m[1]!.slice(1)) : posix.join(posix.dirname(page), m[1]!);
  if (path.startsWith('..')) return target;
  const dir = path.replace(/(^|\/)index$/, '');
  return `/${dir ? `${dir}/` : ''}${m[2] ?? ''}`;
}

/**
 * @param text converted page source
 * @param page the page's path inside the docs tree, forward slashes (`guide/quickstart.md`)
 */
export function rewriteMdLinks(text: string, page: string): string {
  let fence: string | null = null;
  return text
    .split('\n')
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence !== null) {
        if (marker?.startsWith(fence)) fence = null;
        return line;
      }
      if (marker) {
        fence = marker;
        return line;
      }
      return line
        .replace(DEFINITION, (_, lead: string, target: string) => lead + route(target, page))
        .replace(INLINE, (whole, target: string) => whole.slice(0, whole.length - target.length) + route(target, page));
    })
    .join('\n');
}
