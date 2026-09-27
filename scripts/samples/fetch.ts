// Pulls real docs from the repos that will wear the theme and converts them
// into the Starlight example, so `task dev` shows actual content.
//   node scripts/samples/fetch.ts            fetch (shallow, sparse) + convert
//   node scripts/samples/fetch.ts --offline  convert what is already cached
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert } from './convert.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = join(ROOT, '.tmp/samples');
const OUT = join(ROOT, 'examples/starlight/src/content/docs/samples');

const SOURCES = [
  { name: 'ocx', repo: 'ocx-sh/ocx', dir: 'website/src/docs' },
  { name: 'rules_ocx', repo: 'ocx-sh/rules_ocx', dir: 'docs' },
  { name: 'python-sdk', repo: 'ocx-sh/ocx-sdk-python', dir: 'docs' },
  { name: 'catalog', repo: 'ocx-sh/catalog', dir: 'docs' },
];

const offline = process.argv.includes('--offline');

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => join(e.parentPath, e.name));
}

await rm(OUT, { recursive: true, force: true });
for (const { name, repo, dir } of SOURCES) {
  const checkout = join(CACHE, name);
  if (!offline) {
    if (existsSync(checkout)) {
      git(checkout, 'fetch', '--depth=1', 'origin', 'HEAD');
      git(checkout, 'reset', '--hard', 'FETCH_HEAD');
    } else {
      await mkdir(CACHE, { recursive: true });
      git(CACHE, 'clone', '--depth=1', '--filter=blob:none', '--sparse', `https://github.com/${repo}.git`, name);
      git(checkout, 'sparse-checkout', 'set', dir);
    }
  }
  const src = join(checkout, dir);
  if (!existsSync(src)) throw new Error(`${name}: ${src} missing, run without --offline first`);
  const files = await markdownFiles(src);
  for (const file of files) {
    const target = join(OUT, name, relative(src, file));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, convert(await readFile(file, 'utf8')));
  }
  console.log(`${name}: ${files.length} pages from ${repo}/${dir}`);
}
