#!/usr/bin/env node
/**
 * Pack-gate smoke check for `@ocx-sh/theme`.
 *
 * Contract C-031 — the tarball's `exports` keys are exactly the design §4.1
 * list, each key resolves to a file inside the installed tarball, every JS
 * export (`./starlight`, `./nav`, `./icons`, `./toast`, `./toaster`, `./lazy`, `./csp`) carries a `types` condition whose
 * `.d.mts` (prepack emits them, gitignored) or committed hand-written `.d.ts`
 * sibling (`./nav`, `./icons`) is in the tarball, and no `.ts` source ships.
 *
 * Contract C-032 — `publint` and `attw` (JS exports) report clean; `npm
 * publish --dry-run` output never contains `auto-corrected`; the tarball
 * installs with `--ignore-scripts` into the fixture consumer at
 * `tests/fixtures/consumer` (a fresh `mktemp -d` copy, Astro + Starlight,
 * base `/docs/`, `astro/tsconfigs/strictest`); `astro check` and `astro
 * build` pass on it; `node_modules/.bin/ocx-site check` passes on its dist;
 * `@ocx-sh/theme/components/ui/Button.astro` resolves from it.
 *
 * Contract C-124 (D-Z20) — the example's component pages, showcase kit, stories (C-125: the
 * `src/stories` sources and the `src/pages/stories` route) and public assets are copied into that
 * fixture verbatim; its build renders every exported component outside the exempt list, on a doc
 * page or on a story page (checkFixture). The kit's styles reach doc pages only through the
 * example's customCss, so they stay behind there; story pages import them themselves.
 *
 * Usage: node scripts/pack-smoke.mjs (invoked by `task pack`).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENT_EXEMPT } from '../packages/theme/test/component-inventory.mjs';
import { isZagBacked, pageImports, rootClass, stripFences } from '../packages/theme/test/showcase.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const THEME = join(ROOT, 'packages/theme');
const FIXTURE = join(ROOT, 'tests/fixtures/consumer');
const EXAMPLE = join(ROOT, 'examples/starlight');
const EXEMPT = Object.keys(COMPONENT_EXEMPT);

/** Design §4.1: the exact `exports` key set of `@ocx-sh/theme`. */
const EXPORT_KEYS = [
  './tokens.css',
  './base.css',
  './fonts.css',
  './starlight.css',
  './starlight',
  './starlight/*.astro',
  './components/*.astro',
  './layouts/*.astro',
  './chrome',
  './nav.json',
  './nav',
  './vitepress',
  './logo.svg',
  './icons',
  './toast',
  './toaster',
  './cycle-button',
  './prose-code.css',
  './lazy',
  './csp',
];

/**
 * C-124: components whose Zag root renders only for some uses → the use (its opening tag text)
 * that renders one. Every other Zag-backed component renders a root on each use.
 * @type {Record<string, RegExp>}
 */
const ZAG_WHEN = {
  'ui/TagGroup.astro': /\sselectionMode=/,
  // renders its clipboard root only when `first` exists, i.e. unless choices is the literal `[]`
  'ui/CommandBar.astro': /\schoices=\{(?!\[\]\})/,
  // the navigation-menu root is the ocx.sh chrome's; a neutral header (`brand`) has none
  'SiteHeader.astro': /^(?![\s\S]*\sbrand=)/,
};

/** @typedef {Record<string, string | Record<string, string>>} ExportsMap */

/**
 * Pure check for C-031: does `pkgJson.exports` have exactly the §4.1 keys,
 * does each key's target exist in `files` (the tarball's file list), and
 * does every JS export (an object condition, not a bare string) carry a
 * `types` condition pointing at a `.d.mts` or `.d.ts` that is also in `files`, and does
 * `bin['ocx-site']` resolve in `files`? Also fails if any `.ts` path is in `files`.
 *
 * Pure and side-effect-free so it is unit-testable without packing a real
 * tarball (see pack-smoke.test.ts).
 *
 * @param {{ exports?: ExportsMap; bin?: Record<string, string> }} pkgJson
 * @param {readonly string[]} files paths present in the installed tarball, relative to its root
 * @returns {string[]} problems found; empty array means the check passed
 */
export function checkExports(pkgJson, files) {
  const problems = [];
  const exp = pkgJson.exports ?? {};
  const keys = Object.keys(exp);
  for (const k of EXPORT_KEYS) if (!keys.includes(k)) problems.push(`missing export key ${k}`);
  for (const k of keys) if (!EXPORT_KEYS.includes(k)) problems.push(`unexpected export key ${k}`);

  const present = new Set(files);
  /** @param {string} target */
  const resolves = (target) => {
    const t = target.replace(/^\.\//, '');
    if (!t.includes('*')) return present.has(t);
    const [pre, post] = t.split('*');
    return files.some((f) => f.startsWith(pre ?? '') && f.endsWith(post ?? '') && f.length > t.length - 1);
  };
  for (const [k, v] of Object.entries(exp)) {
    const targets = typeof v === 'string' ? [v] : Object.values(v);
    for (const t of targets) if (!resolves(t)) problems.push(`export ${k}: ${t} is not in the tarball`);
    if (typeof v !== 'string' && !/\.d\.m?ts$/.test(v.types ?? ''))
      problems.push(`export ${k}: JS export has no \`types\` condition pointing at a .d.mts or .d.ts`);
  }
  for (const [name, target] of Object.entries(pkgJson.bin ?? {}))
    if (!resolves(target)) problems.push(`bin ${name}: ${target} is not in the tarball`);
  if (!pkgJson.bin?.['ocx-site']) problems.push('bin ocx-site is missing');
  for (const f of files)
    if (/\.(ts|mts|cts)$/.test(f) && !/\.d\.(ts|mts|cts)$/.test(f)) problems.push(`.ts source in tarball: ${f}`);
  return problems;
}

/**
 * C-124 on the built consumer fixture: every exported component outside `exempt` is imported by
 * a copied page or story; each importing page's built HTML contains the component (its root class,
 * and for a Zag-backed one a `[data-zag-root]` per use), and on doc pages the chrome overrides
 * render (`#starlight__search`, `.sl-menu-button`); story pages have no chrome. Each problem names
 * the component or page.
 * @param {{ components: Record<string, string>, pages: Record<string, string>, html: Record<string, string | undefined>, exempt: readonly string[], stories?: Record<string, string>, storyHtml?: Record<string, string | undefined> }} input
 *   components: specifier → `.astro` source; pages: slug → copied `.mdx`; html: slug → built HTML;
 *   stories: story id (`tabs/default`) → copied `.mdx`; storyHtml: story id → built HTML
 * @returns {string[]}
 */
export function checkFixture({ components, pages, html, exempt, stories = {}, storyHtml = {} }) {
  /** @type {string[]} */ const problems = [];
  const covered = new Set();
  /** @param {string} page @param {string} mdx @param {string | undefined} built @param {boolean} chrome */
  const check = (page, mdx, built, chrome) => {
    const imports = [...pageImports(mdx)].filter(([, spec]) => spec in components && !exempt.includes(spec));
    if (!imports.length) return;
    if (built === undefined) {
      problems.push(`${page}: page imports ${imports.map(([, s]) => s).join(', ')} but was not built`);
      return;
    }
    for (const [local, spec] of imports) {
      covered.add(spec);
      const source = components[spec] ?? '';
      const cls = rootClass(source);
      const tags = [...built.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0]);
      const hasClass = (/** @type {string} */ t) =>
        (/\sclass="([^"]*)"/.exec(t)?.[1] ?? '').split(/\s+/).includes(cls ?? '');
      // ponytail: a slot-only component (TreeDescription) has no root to find; its import is the proof.
      const withClass = cls ? tags.filter(hasClass) : tags;
      if (cls && !withClass.length) problems.push(`${spec}: page ${page} built without it (no .${cls})`);
      if (isZagBacked(source)) {
        // ponytail: a use's attributes run to the next `<`; an attribute holding `<` would cut it short.
        const uses = [...stripFences(mdx).matchAll(new RegExp(`<${local}[\\s/>][^<]*`, 'g'))].filter(
          ([use]) => ZAG_WHEN[spec]?.test(use) ?? true,
        ).length;
        // The root may sit below a wrapper (TagGroup's field): match it by its static name, else by class.
        // A `<script>` selector never names it, and a dynamic root (Choice: checkbox | switch) has no static name.
        const markup = source.replace(/<script[\s\S]*?<\/script>/g, '');
        const name = /data-zag-root=\{/.test(markup) ? undefined : /data-zag-root="([\w-]+)"/.exec(markup)?.[1];
        const roots = name
          ? tags.filter((t) => new RegExp(`\\sdata-zag-root="${name}"`).test(t)).length
          : withClass.filter((t) => /\sdata-zag-root[\s=>]/.test(t)).length;
        if (roots < uses) problems.push(`${spec}: page ${page} uses it ${uses}× but renders ${roots} [data-zag-root]`);
      }
    }
    if (!chrome) return;
    for (const [hook, re] of /** @type {const} */ ([
      ['#starlight__search', /\bid="starlight__search"/],
      ['.sl-menu-button', /\bclass="[^"]*\bsl-menu-button\b/],
    ]))
      if (!re.test(built)) problems.push(`${page}: chrome override ${hook} did not render`);
  };
  for (const [page, mdx] of Object.entries(pages)) check(page, mdx, html[page], true);
  for (const [id, mdx] of Object.entries(stories)) check(`stories/${id}`, mdx, storyHtml[id], false);
  for (const spec of Object.keys(components))
    if (!exempt.includes(spec) && !covered.has(spec)) problems.push(`${spec}: no copied page imports it`);
  return problems;
}

/**
 * Runs `cmd args` in `cwd`, echoing its output; throws naming `step` on a non-zero exit.
 * @param {string} step
 * @param {string} cwd
 * @param {string} cmd
 * @param {string[]} args
 * @param {RegExp} [tolerate] a non-zero exit whose output matches is not an error
 * @returns {{ stdout: string, all: string }} stdout, and stdout + stderr
 */
function run(step, cwd, cmd, args, tolerate) {
  process.stderr.write(`pack-smoke: ${step}: ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
  const all = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error) throw new Error(`${step}: cannot spawn ${cmd}: ${r.error.message}`);
  if (r.status !== 0 && !tolerate?.test(all)) throw new Error(`${step}: exited ${String(r.status)}\n${all}`);
  return { stdout: r.stdout, all };
}

/** @param {string} text @returns {unknown} */
const parseJson = (text) => JSON.parse(text);

/** @param {string} out @param {string} step */
function noAutoCorrect(out, step) {
  if (out.includes('auto-corrected')) throw new Error(`${step}: npm auto-corrected the manifest\n${out}`);
}

function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'ocx-pack-smoke-'));
  try {
    // npm pack runs prepack (tsc → .d.mts) itself.
    const packed = run('pack', THEME, 'npm', ['pack', '--json', '--pack-destination', tmp]);
    noAutoCorrect(packed.all, 'pack');
    // prepack's own output precedes the JSON on stdout.
    const json = packed.stdout.slice(packed.stdout.lastIndexOf('\n[') + 1);
    const filename = /** @type {{ filename: string }[]} */ (parseJson(json)).at(0)?.filename;
    if (!filename) throw new Error('pack: npm pack --json named no tarball');
    const tarball = join(tmp, filename);

    // C-031 on the tarball's own manifest and file list.
    const pkgDir = join(tmp, 'extract');
    mkdirSync(pkgDir);
    run('extract', tmp, 'tar', ['-xzf', tarball, '-C', pkgDir]);
    const unpacked = join(pkgDir, 'package');
    const files = readdirSync(unpacked, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) =>
        join(d.parentPath, d.name)
          .slice(unpacked.length + 1)
          .split('\\')
          .join('/'),
      );
    const pkgJson = /** @type {{ exports?: ExportsMap; bin?: Record<string, string> }} */ (
      parseJson(readFileSync(join(unpacked, 'package.json'), 'utf8'))
    );
    const problems = checkExports(pkgJson, files);
    // Third-party material (the MDI Tux path) ships with its notice.
    if (!files.includes('THIRD_PARTY_NOTICES')) problems.push('THIRD_PARTY_NOTICES is not in the tarball');
    if (problems.length > 0) throw new Error(`C-031 exports:\n  ${problems.join('\n  ')}`);

    run('publint', ROOT, join(ROOT, 'node_modules/.bin/publint'), ['run', tarball, '--strict']);
    // attw: ESM-only package (.mjs + .d.mts, no `require` condition), so the
    // `esm-only` profile skips the CJS-resolution columns; only the JS
    // exports are type-checked — the CSS/.astro/.json/.svg keys carry no types.
    run('attw', ROOT, join(ROOT, 'node_modules/.bin/attw'), [
      tarball,
      '--profile',
      'esm-only',
      '--entrypoints',
      './starlight',
      './nav',
      './icons',
      './toast',
      './toaster',
      './cycle-button',
      './lazy',
      './csp',
      '--format',
      'table',
    ]);
    // Directory form, not the tarball: npm only normalizes (and warns
    // `auto-corrected`) when publishing from a package dir. --offline: no
    // registry round-trip, so the result never depends on network or on
    // whether this version is already published. --ignore-scripts: prepack
    // already ran for the tarball above. npm 11 still refuses a version the registry
    // cache already knows (the tree sits at the last release between bumps): that one
    // error is tolerated, every manifest warning printed before it is still checked.
    const dryRun = run(
      'publish --dry-run',
      THEME,
      'npm',
      ['publish', '--dry-run', '--offline', '--ignore-scripts'],
      /cannot publish over the previously published/,
    );
    noAutoCorrect(dryRun.all, 'publish --dry-run');

    // C-032: the tarball installed into a fresh fixture consumer.
    const site = join(tmp, 'site');
    cpSync(FIXTURE, site, { recursive: true });
    const sitePkg = join(site, 'package.json');
    const manifest = /** @type {{ dependencies: Record<string, string> }} */ (parseJson(readFileSync(sitePkg, 'utf8')));
    manifest.dependencies['@ocx-sh/theme'] = `file:${tarball}`;
    writeFileSync(sitePkg, `${JSON.stringify(manifest, null, 2)}\n`);
    // C-124 (D-Z20): the example's component pages, showcase kit and public assets, verbatim.
    for (const dir of [
      'src/content/docs/components',
      'src/components/showcase',
      'src/stories',
      'src/pages/stories',
      'src/pages/shell',
      'public',
    ])
      // LivePreviews.astro serves /docs/previews/ (not copied) and imports a repo script by path.
      cpSync(join(EXAMPLE, dir), join(site, dir), {
        recursive: true,
        filter: (src) => !src.endsWith('LivePreviews.astro'),
      });
    run('install', site, 'pnpm', ['install', '--ignore-scripts', '--prefer-offline', '--ignore-workspace']);
    // Nested `components/ui/*.astro` resolve through the one `./components/*.astro` key (`*` matches `/`).
    const ui = createRequire(sitePkg).resolve('@ocx-sh/theme/components/ui/Button.astro');
    if (!ui.replaceAll('\\', '/').endsWith('/src/components/ui/Button.astro'))
      throw new Error(`ui export: @ocx-sh/theme/components/ui/Button.astro resolved to ${ui}`);
    run('astro check', site, join(site, 'node_modules/.bin/astro'), ['check']);
    run('astro build', site, join(site, 'node_modules/.bin/astro'), ['build']);
    // C-124: every exported component rendered by a copied page (tarball's own component list).
    const componentsRoot = join(unpacked, 'src/components');
    const components = Object.fromEntries(
      files
        .filter((f) => f.startsWith('src/components/') && f.endsWith('.astro'))
        .map((f) => [f.slice('src/components/'.length), readFileSync(join(unpacked, f), 'utf8')]),
    );
    if (!Object.keys(components).length) throw new Error(`C-124: no components under ${componentsRoot}`);
    const pagesDir = join(site, 'src/content/docs/components');
    const pages = Object.fromEntries(
      readdirSync(pagesDir)
        .filter((f) => /\.mdx?$/.test(f))
        .map((f) => [f.replace(/\.mdx?$/, ''), readFileSync(join(pagesDir, f), 'utf8')]),
    );
    /** @param {string} slug */
    const built = (slug) => {
      const file = join(site, 'dist/components', slug === 'index' ? '' : slug, 'index.html');
      return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    };
    const html = Object.fromEntries(Object.keys(pages).map((slug) => [slug, built(slug)]));
    // C-125: stories are asserted on their own built pages (dist/stories/<id>/index.html).
    const storiesDir = join(site, 'src/stories');
    const stories = Object.fromEntries(
      readdirSync(storiesDir, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.mdx'))
        .map((f) => [f.split('\\').join('/').slice(0, -'.mdx'.length), readFileSync(join(storiesDir, f), 'utf8')]),
    );
    const storyHtml = Object.fromEntries(
      Object.keys(stories).map((id) => {
        const file = join(site, 'dist/stories', id, 'index.html');
        return [id, existsSync(file) ? readFileSync(file, 'utf8') : undefined];
      }),
    );
    const missing = checkFixture({ components, pages, html, exempt: EXEMPT, stories, storyHtml });
    if (missing.length > 0) throw new Error(`C-124 fixture render:\n  ${missing.join('\n  ')}`);
    // --repo/--path: the fixture's base `/docs/` is ocx-sh/ocx's claim in nav.json.
    run('ocx-site check', site, join(site, 'node_modules/.bin/ocx-site'), [
      'check',
      '--dist',
      'dist',
      '--repo',
      'ocx-sh/ocx',
      '--path',
      '/docs/',
    ]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Only run when invoked directly (`node scripts/pack-smoke.mjs`), not when
// pack-smoke.test.ts imports `checkExports`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
    process.stderr.write('pack-smoke: OK\n');
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`pack-smoke: FAILED — ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}
