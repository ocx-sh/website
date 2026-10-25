// The live header's publish step (r10). The `shell-fragment.html` endpoint renders the header's swappable
// parts from the theme's own components; once the build is done this files them under their content
// address (`/_shell/v1/<rev>/nav.html`) and points `/_shell/v1/current.json` at them. Astro ignores
// underscore-prefixed routes, so a page cannot be the fragment itself. Runs before Starlight's Pagefind
// hook: the temporary file must be gone before the index is built.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { validate } from '@ocx-sh/theme/nav';
import { SHELL_DIR, SHELL_PARTS } from '@ocx-sh/theme/shell';
import { shellRev } from '@ocx-sh/theme/shell-rev';

/** The endpoint's output in `dist`, removed once filed. */
export const FRAGMENT_FILE = 'shell-fragment.html';

/**
 * Files the rendered fragment under its rev and points `current.json` at it. The pointer is written last,
 * and only for a valid nav whose fragment holds exactly the parts the loader swaps: a bad build keeps
 * the previous pointer (rev directories are immutable, so it stays valid).
 * @param {string} dist absolute path of the build output
 * @param {import('@ocx-sh/theme/nav').Nav} [registry]
 * @returns {Promise<string>} the rev
 */
export async function publishShell(dist, registry = nav) {
  const problems = validate(registry);
  if (problems.length > 0)
    throw new Error(
      `shell: nav.json is invalid, no header published:\n${problems.map((p) => `${p.at}: ${p.message}`).join('\n')}`,
    );
  const file = join(dist, FRAGMENT_FILE);
  const html = await readFile(file, 'utf8');
  const names = [...html.matchAll(/<template data-shell-part="([^"]+)">/g)].map((m) => m[1]);
  if (names.join() !== SHELL_PARTS.join())
    throw new Error(`shell: fragment has parts [${names.join()}], expected [${SHELL_PARTS.join()}]`);
  const rev = shellRev(html);
  const dir = join(dist, SHELL_DIR);
  await mkdir(join(dir, rev), { recursive: true });
  await writeFile(join(dir, rev, 'nav.html'), html);
  await writeFile(join(dir, 'current.json'), `${JSON.stringify({ v: 1, rev })}\n`);
  await rm(file);
  return rev;
}

/** The Astro integration: list it before `starlight()`. */
export default function shellFragment() {
  return {
    name: 'ocx-site-shell-fragment',
    hooks: {
      /** @param {{ dir: URL }} ctx */
      'astro:build:done': async ({ dir }) => void (await publishShell(fileURLToPath(dir))),
    },
  };
}
