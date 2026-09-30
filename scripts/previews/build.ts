// Builds the preview sites: each consumer's docs, converted from the samples cache, as its own Astro + Starlight
// site under `.tmp/previews/<site>/dist`. Always offline (run `task samples` to refresh the cache).
//   node scripts/previews/build.ts [site…]     all sites, or the named ones (name or host slug)
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES, findSite, previewUrl } from './sites.mjs';
import { prepareSite, projectDir } from '../samples/fetch.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
// Astro joins --config onto --root, so it is passed relative to the project.
const CONFIG = join(ROOT, 'examples/previews/astro.config.mjs');

const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const failed: string[] = [];
for (const site of named.length ? named.map(findSite) : SITES) {
  try {
    const pages = await prepareSite(site, true);
    console.log(`${site.name}: ${pages} pages, building for ${previewUrl(site)}`);
    execFileSync(
      'pnpm',
      ['exec', 'astro', 'build', '--root', projectDir(site), '--config', relative(projectDir(site), CONFIG)],
      {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: 600_000,
        env: { ...process.env, PREVIEW_SITE: site.name },
      },
    );
  } catch (e) {
    console.error(`${site.name}: ${e instanceof Error ? e.message : String(e)}`);
    failed.push(site.name);
  }
}
if (failed.length) {
  console.error(`previews failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
