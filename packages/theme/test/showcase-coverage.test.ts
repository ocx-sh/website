// WP14: every theme component gets a showcase page (AGENTS.md "Working here").
// Scans the filesystem: each .astro under src/components/** must be imported by
// some .mdx under the example site's components/ dir via its package specifier,
// unless it is a private sub-component exempt through COMPONENT_EXEMPT, or a
// Starlight override classified in STARLIGHT_OVERRIDES (both from component-inventory.mjs, C-108b).
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMPONENT_EXEMPT, STARLIGHT_OVERRIDES } from './component-inventory.mjs';
import { pageImports } from './showcase.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const themeRoot = join(here, '..');
const repoRoot = join(themeRoot, '..', '..');
const componentsDir = join(themeRoot, 'src', 'components');
const starlightDir = join(themeRoot, 'src', 'starlight');
const docsDir = join(repoRoot, 'examples', 'starlight', 'src', 'content', 'docs', 'components');
// C-125: a component shown only in a story is covered by that story's import.
const storiesDir = join(repoRoot, 'examples', 'starlight', 'src', 'stories');

async function findAstroFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return findAstroFiles(full);
      return entry.name.endsWith('.astro') ? [full] : [];
    }),
  );
  return files.flat();
}

async function findMdxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile() && /\.mdx?$/.test(e.name)).map((e) => join(e.parentPath, e.name));
}

/** Package-relative specifier for a components/-tree .astro file, e.g. "ui/Button.astro". */
function specifierFor(absPath: string): string {
  return relative(componentsDir, absPath).split('\\').join('/');
}

describe('WP14 showcase coverage', () => {
  it('every packages/theme/src/components/**/*.astro is imported by a components/ or stories/ mdx, or explicitly exempt', async () => {
    const [componentFiles, docFiles, storyFiles] = await Promise.all([
      findAstroFiles(componentsDir),
      findMdxFiles(docsDir),
      findMdxFiles(storiesDir),
    ]);
    const mdxFiles = [...docFiles, ...storyFiles];
    const mdxSources = mdxFiles.map((f) => readFileSync(f, 'utf8'));

    // Fence-stripped: an import shown in a code sample covers nothing.
    const importedSpecifiers = new Set(mdxSources.flatMap((source) => [...pageImports(source).values()]));

    const coveredByImport = new Set<string>();
    const uncovered: string[] = [];
    for (const abs of componentFiles) {
      const spec = specifierFor(abs);
      if (importedSpecifiers.has(spec)) coveredByImport.add(spec);
      else uncovered.push(spec);
    }

    // Every exemption's file must actually exist and not already be directly covered (no stale entries).
    for (const [file, { parent }] of Object.entries(COMPONENT_EXEMPT)) {
      expect(
        componentFiles.some((abs) => specifierFor(abs) === file),
        `EXEMPT file ${file} does not exist`,
      ).toBe(true);
      const parentCovered =
        coveredByImport.has(parent) ||
        parent in COMPONENT_EXEMPT ||
        (parent.startsWith('starlight/') && parent.slice('starlight/'.length) in STARLIGHT_OVERRIDES);
      expect(parentCovered, `EXEMPT ${file}'s parent ${parent} is not itself covered`).toBe(true);
    }

    const stillUncovered = uncovered.filter((spec) => !(spec in COMPONENT_EXEMPT));
    expect(stillUncovered, `no showcase page imports: ${stillUncovered.join(', ')}`).toEqual([]);
  });

  it('every packages/theme/src/starlight/*.astro is classified in STARLIGHT_OVERRIDES', async () => {
    const files = (await findAstroFiles(starlightDir)).map((abs) => relative(starlightDir, abs).split('\\').join('/'));
    expect(new Set(files)).toEqual(new Set(Object.keys(STARLIGHT_OVERRIDES)));
  });
});
