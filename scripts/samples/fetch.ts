// Pulls real docs from the repos that will wear the theme and converts them into one Starlight project per
// site under `.tmp/previews/<site>/` (built by `task previews`, see scripts/previews/build.ts).
//   node scripts/samples/fetch.ts [site…]             fetch (shallow, sparse) + convert
//   node scripts/samples/fetch.ts --offline [site…]   convert what is already cached
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteMdLinks } from '../previews/links.ts';
import { SITES, findSite, type PreviewSite } from '../previews/sites.mjs';
import { castRefs, convert, outputExtension } from './convert.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(ROOT, '.tmp/samples');
/** Generated project of a site: `src/content/docs`, `public/casts`, and later `dist`. */
export const projectDir = (site: PreviewSite) => join(ROOT, '.tmp/previews', site.name);

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'inherit'], timeout: 120_000 });
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => join(e.parentPath, e.name));
}

/** The docs collection Starlight reads; written into each project (a committed .ts here would sit outside every tsconfig). */
const CONTENT_CONFIG = `import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
`;

/** Shallow, sparse clone of the site's docs directory into the cache, or a refresh of it. */
export async function pull({ name, repo, dir }: PreviewSite): Promise<void> {
  const checkout = join(CACHE, name);
  if (existsSync(checkout)) {
    git(checkout, 'fetch', '--depth=1', 'origin', 'HEAD');
    git(checkout, 'reset', '--hard', 'FETCH_HEAD');
  } else {
    await mkdir(CACHE, { recursive: true });
    git(CACHE, 'clone', '--depth=1', '--filter=blob:none', '--sparse', `https://github.com/${repo}.git`, name);
    git(checkout, 'sparse-checkout', 'set', dir);
  }
}

export const CASTS_ORIGIN = 'https://ocx.sh/casts/';

export interface CastSyncOptions {
  /** Download cache, `.tmp/samples/casts/`; reused when a cast is already there. */
  cache: string;
  /** Served copy, a site's `public/casts/`; everything but `fixture/` is replaced each run. */
  out: string;
  /** Never call `download`; only cached casts are copied. */
  offline: boolean;
  /** Fetches one URL; `null` for a non-2xx answer. A throw counts as missing too. */
  download: (url: string) => Promise<Uint8Array | null>;
}

/**
 * Makes `out` hold exactly the casts in `refs` (paths relative to `/casts/`, from castRefs) plus the untouched
 * `fixture/`: stale fetched casts are removed, each ref is taken from the cache or downloaded from
 * CASTS_ORIGIN into the cache, then copied. Never throws for a missing cast. Once a download throws (network or
 * timeout failure), every remaining uncached ref is reported missing without another download attempt — a hung
 * network must not retry once per cast. Prints one summary line with the referenced and missing counts
 * (`console.warn` when any are missing, else `console.log`), and returns the missing list.
 */
export async function syncCasts(refs: readonly string[], opts: CastSyncOptions): Promise<{ missing: string[] }> {
  await mkdir(opts.out, { recursive: true });
  for (const entry of await readdir(opts.out))
    if (entry !== 'fixture') await rm(join(opts.out, entry), { recursive: true, force: true });
  const missing: string[] = [];
  let downloadBroken = false;
  for (const ref of refs) {
    const cached = join(opts.cache, ref);
    if (!existsSync(cached)) {
      let bytes: Uint8Array | null = null;
      if (!opts.offline && !downloadBroken) {
        try {
          bytes = await opts.download(CASTS_ORIGIN + ref);
        } catch {
          downloadBroken = true;
        }
      }
      if (!bytes) {
        missing.push(ref);
        continue;
      }
      await mkdir(dirname(cached), { recursive: true });
      await writeFile(cached, bytes);
    }
    await mkdir(dirname(join(opts.out, ref)), { recursive: true });
    await copyFile(cached, join(opts.out, ref));
  }
  const reason = missing.length ? ` (${opts.offline ? 'offline, not cached' : 'download failed'})` : '';
  const line = `casts: ${refs.length} referenced, ${missing.length} missing${reason}`;
  (missing.length ? console.warn : console.log)(line);
  return { missing };
}

/**
 * Rebuilds the site's generated project from the cache: converted pages (relative `.md` links rewritten to routes)
 * in `src/content/docs` (plus a 404 page when the site has none), the content collection config, and the casts the pages play in `public/casts`.
 * With `offline`, casts come from the cache only. Returns the page count.
 */
export async function prepareSite(site: PreviewSite, offline: boolean): Promise<number> {
  const project = projectDir(site);
  const src = join(CACHE, site.name, site.dir);
  if (!existsSync(src)) throw new Error(`${site.name}: ${src} missing, run \`task samples\` first`);
  const docs = join(project, 'src/content/docs');
  await rm(docs, { recursive: true, force: true });
  const refs = new Set<string>();
  const files = await markdownFiles(src);
  for (const file of files) {
    const page = relative(src, file).split('\\').join('/');
    const text = rewriteMdLinks(convert(await readFile(file, 'utf8')), page);
    for (const ref of castRefs(text)) refs.add(ref);
    const target = join(docs, page).replace(/\.md$/, outputExtension(text));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  await writeFile(join(project, 'src/content.config.ts'), CONTENT_CONFIG);
  if (!existsSync(join(docs, '404.md'))) await copyFile(join(ROOT, 'examples/previews/404.md'), join(docs, '404.md'));
  await syncCasts([...refs], {
    cache: join(CACHE, 'casts'),
    out: join(project, 'public/casts'),
    offline,
    download: async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
  });
  return files.length;
}

// ponytail: main guard so the test can import syncCasts without running the fetch.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const offline = process.argv.includes('--offline');
  const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const site of named.length ? named.map(findSite) : SITES) {
    if (!offline) await pull(site);
    console.log(`${site.name}: ${await prepareSite(site, offline)} pages from ${site.repo}/${site.dir}`);
  }
}
