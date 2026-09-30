import { existsSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { castRefs, convert, iconForLabel, outputExtension } from './convert.ts';
import { CASTS_ORIGIN, syncCasts } from './fetch.ts';

const IMPORT =
  "import Tabs from '@ocx-sh/theme/components/Tabs.astro';\nimport TabItem from '@ocx-sh/theme/components/TabItem.astro';";

// The MDX compiler Astro itself runs (@astrojs/mdx → @astrojs/markdown-satteri → satteri), resolved from the
// example's Starlight so the test compiles with exactly what `astro build` would. None is a direct dependency.
const hop = (from: string, id: string) => createRequire(from).resolve(id);
const starlight = realpathSync(new URL('../../examples/starlight/node_modules/@astrojs/starlight', import.meta.url));
const satteri = hop(hop(hop(`${starlight}/x.js`, '@astrojs/mdx'), '@astrojs/markdown-satteri'), 'satteri');
const { mdxToJs } = (await import(pathToFileURL(satteri).href)) as { mdxToJs: (src: string) => unknown };

/** Strips fenced code so assertions about prose cannot be satisfied (or broken) by fence contents. */
const prose = (s: string) => s.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');

describe('convert', () => {
  it('lifts the H1 into title frontmatter and strips heading anchors', () => {
    const out = convert('---\noutline: deep\n---\n# Getting Started {#start}\n\n## Next {#next}\n');
    expect(out).toBe('---\ntitle: "Getting Started"\n---\n\n## Next\n');
  });

  it('turns VitePress containers into asides and details', () => {
    const out = convert('# T\n::: tip First\nbody\n:::\n::: details Why\nmore\n:::\n');
    expect(out).toContain(':::tip[First]\nbody\n:::');
    expect(out).toContain('<details><summary>Why</summary>\n\nmore\n\n</details>');
  });

  it('turns Material admonitions into asides', () => {
    const out = convert('# T\n!!! warning "Careful"\n    Indented body.\n');
    expect(out).toContain(':::caution[Careful]\nIndented body.\n:::');
  });

  it('keeps a single titled fence outside a group as titled code', () => {
    const out = convert('# T\n```sh [Shell]\nx\n```\n');
    expect(out).toContain('```sh title="Shell"\nx\n```');
    expect(out).not.toContain('<Tabs');
    expect(outputExtension(out)).toBe('.md');
  });

  it('leaves code fences untouched', () => {
    const out = convert('# T\n```md\n::: tip\n# not a title\n```\n');
    expect(out).toContain('```md\n::: tip\n# not a title\n```');
  });
});

describe('convert: content tabs → <Tabs>', () => {
  const codeGroup = '# T\n::: code-group\n```sh [Shell]\nx\n```\n\n```ps1 [PowerShell]\ny\n```\n:::\n';
  const material =
    '# T\n=== "Python"\n\n    ```python-no-run\n    x = 1\n    ```\n\n=== "Rust"\n\n    Plain text tab.\n';

  it('WP3 converter: VitePress ::: code-group becomes <Tabs syncKey="shell"> with a TabItem per [Label]', () => {
    const out = convert(codeGroup);
    expect(out).toContain('<Tabs syncKey="shell">');
    expect(out).toContain('<TabItem label={"Shell"} icon="shell">');
    expect(out).toContain('<TabItem label={"PowerShell"} icon="powershell">');
    expect(out.indexOf('<TabItem label={"Shell"}')).toBeLessThan(out.indexOf('```sh'));
    expect(out.indexOf('```sh')).toBeLessThan(out.indexOf('<TabItem label={"PowerShell"}'));
    expect(out.match(/<\/TabItem>/g)).toHaveLength(2);
    expect(out).toContain('</Tabs>');
    expect(out).not.toContain('code-group');
    expect(out).toMatch(/```sh[^\n]*\nx\n```/);
  });

  it('WP3 converter: Material === "X" tabs become <Tabs syncKey="shell"> with a TabItem each', () => {
    const out = convert(material);
    expect(out).toContain('<Tabs syncKey="shell">');
    expect(out).toContain('<TabItem label={"Python"}>');
    expect(out).toContain('<TabItem label={"Rust"}>');
    expect(out).toMatch(/```python[^\n]*\nx = 1\n```/);
    expect(out).toContain('Plain text tab.');
    expect(out).not.toContain('===');
    expect(out).toContain('</Tabs>');
  });

  it('C-152 converter: the theme Tabs imports follow the frontmatter directly; nothing from Starlight', () => {
    for (const out of [convert(codeGroup), convert(material)]) {
      expect(out).toMatch(/^---\n[\s\S]*?\n---\n\n?import Tabs from '@ocx-sh\/theme\/components\/Tabs\.astro';\n/);
      expect(out.split(IMPORT)).toHaveLength(2);
      expect(out).not.toContain('@astrojs/starlight/components');
    }
  });

  it('C-152 converter: a TabItem gets the icon of the shell its label names; other labels none', () => {
    const out = convert(material);
    expect(out).toContain('<TabItem label={"Python"}>');
    expect(convert('# T\n=== "fish"\n\n    x\n\n=== "bash / zsh shell"\n\n    y\n')).toMatch(
      /<TabItem label=\{"fish"\} icon="fish">[\s\S]*<TabItem label=\{"bash \/ zsh shell"\} icon="shell">/,
    );
  });

  it.each([
    ['Shell', 'shell'],
    ['PowerShell', 'powershell'],
    ['Nushell', 'nushell'],
    ['fish', 'fish'],
    ['Elvish', 'elvish'],
    ['SHELL', 'shell'],
    ['powershell 7', 'powershell'],
    ['Windows', undefined],
    ['', undefined],
  ])('C-152 iconForLabel(%j) → %j (case-insensitive substring, longest key first)', (label, key) => {
    expect(iconForLabel(label)).toBe(key);
  });

  it('WP3 converter: outputExtension is .mdx for tabbed output and .md otherwise', () => {
    expect(outputExtension(convert(codeGroup))).toBe('.mdx');
    expect(outputExtension(convert(material))).toBe('.mdx');
    expect(outputExtension(convert('# T\n\nplain\n'))).toBe('.md');
  });

  it('WP13.5 convert: outputExtension stays .md for a body that merely starts with the word "import"', () => {
    expect(outputExtension(convert('# T\n\nimport this\n'))).toBe('.md');
  });

  it('WP3 converter: tabbed output compiles as MDX', () => {
    for (const out of [convert(codeGroup), convert(material)]) {
      expect(out).toContain('<TabItem');
      expect(() => mdxToJs(out)).not.toThrow();
    }
  });
});

describe('convert: MDX safety on .mdx pages', () => {
  const fenceBody = 'const a = { b: 1 } < 2; <!-- kept -->';
  const page = [
    '# T',
    '',
    '<!-- editor note -->',
    'Set a { b and a < b, or a <b, also {name} here.',
    'Inline `{x}` and `a<b` stay.',
    '',
    '```ts',
    fenceBody,
    '```',
    '',
    '::: code-group',
    '```sh [Shell]',
    'echo {a}',
    '```',
    ':::',
    '',
  ].join('\n');

  it('WP3 converter: HTML comments are stripped from prose', () => {
    const out = convert(page);
    expect(outputExtension(out)).toBe('.mdx');
    expect(prose(out)).not.toContain('<!--');
    expect(out).not.toContain('editor note');
  });

  it('WP3 converter: code fences and inline code are untouched', () => {
    const out = convert(page);
    expect(out).toContain(`\`\`\`ts\n${fenceBody}\n\`\`\``);
    expect(out).toMatch(/```sh[^\n]*\necho \{a\}\n```/);
    expect(out).toContain('Inline `{x}` and `a<b` stay.');
  });

  it('WP3 converter: bare braces and stray < in prose are escaped', () => {
    const text = prose(convert(page))
      .split('\n')
      .find((l) => l.startsWith('Set a'));
    expect(text).toBeDefined();
    expect(text).not.toMatch(/(^|[^\\])[{}<]/);
    // Backslash escapes or entities; either way the reader sees the original text.
    const unescaped = text
      ?.replace(/\\(?=[{}<])/g, '')
      .replace(/&lt;|&#60;/g, '<')
      .replace(/&#123;/g, '{')
      .replace(/&#125;/g, '}');
    expect(unescaped).toBe('Set a { b and a < b, or a <b, also {name} here.');
  });

  it('WP3 converter: the page with comments, braces and < compiles as MDX', () => {
    expect(() => mdxToJs(convert(page))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// WP13.5: ocx VitePress components → @ocx-sh/theme components.

const THEME = '@ocx-sh/theme/components';
const imp = (name: string, file = name) => `import ${name} from '${THEME}/${file}.astro';`;
const STARLIGHT_IMPORT = /^import \{([^}]*)\} from '@astrojs\/starlight\/components';$/m;
/** The converted page must be MDX Astro can compile. */
const compiles = (out: string) => expect(() => mdxToJs(out)).not.toThrow();
/** Lines of the converted body that are not frontmatter or imports. */
const bodyLines = (out: string) =>
  out
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .split('\n')
    .filter((l) => !l.startsWith('import '));

describe('WP13.5 convert: component imports', () => {
  const cases: [string, string, string[]][] = [
    [
      'Terminal',
      '<Terminal src="/casts/getting-started/env.cast" title="Package environment" collapsed />',
      [imp('Terminal')],
    ],
    ['Tooltip', 'Pinned by <Tooltip term="OCI digest">A SHA-256 fingerprint.</Tooltip>, not ranges.', [imp('Tooltip')]],
    [
      'Tree/Node/Description',
      '<Tree>\n  <Node name="bin/" open>\n    <Description>binaries</Description>\n    <Node name="tool" />\n  </Node>\n</Tree>',
      [imp('Tree'), imp('Node', 'TreeNode'), imp('Description', 'TreeDescription')],
    ],
    ['PlatformIcons', `| sh | <PlatformIcons mode="os" :platforms="['linux','darwin']" /> |`, [imp('PlatformIcons')]],
    [
      'FeatureSection',
      '<FeatureSection title="Built for Automation">\n  <template #text>\n\nBody.\n\n  </template>\n</FeatureSection>',
      [imp('FeatureSection')],
    ],
    ['DependencyExplorer', '<DependencyExplorer />', [imp('DependencyExplorer')]],
  ];

  for (const [label, snippet, imports] of cases) {
    it(`WP13.5 convert: ${label} makes the page .mdx with one import per used component`, () => {
      const out = convert(`# T\n\nIntro.\n\n${snippet}\n`);
      expect(outputExtension(out)).toBe('.mdx');
      for (const line of imports) expect(out.split(line)).toHaveLength(2);
      // Imports sit right after the frontmatter, before any body text.
      const lastImport = Math.max(...imports.map((l) => out.indexOf(l)));
      expect(lastImport).toBeLessThan(out.indexOf('Intro.'));
      compiles(out);
    });
  }

  it('WP13.5 convert: only the components a page uses are imported', () => {
    const out = convert('# T\n\n<Terminal src="/casts/a.cast" collapsed />\n');
    expect(out).toContain(imp('Terminal'));
    for (const name of ['Tooltip', 'Tree', 'PlatformIcons', 'FeatureSection', 'DependencyExplorer'])
      expect(out).not.toContain(`import ${name} `);
    expect(out).not.toMatch(STARLIGHT_IMPORT);
  });

  it('WP13.5 convert: a component used twice is imported once', () => {
    const out = convert('# T\n\n<Terminal src="/casts/a.cast" />\n\n<Terminal src="/casts/b.cast" />\n');
    expect(out.split(imp('Terminal'))).toHaveLength(2);
    compiles(out);
  });

  it('WP13.5 convert: component tags inside code fences are not uses (page stays .md, fence untouched)', () => {
    const fence = '```md\n<Terminal src="/casts/a.cast" collapsed />\n<Tree :collapsible="false">\n```';
    const out = convert(`# T\n\n${fence}\n`);
    expect(outputExtension(out)).toBe('.md');
    expect(out).not.toContain('import ');
    expect(out).toContain(fence);
  });

  it('WP13.5 convert: <Steps> is imported from Starlight, Tabs from the theme', () => {
    const page = '# T\n\n<Steps>\n\n1. One.\n2. Two.\n\n</Steps>\n\n::: code-group\n```sh [Shell]\nx\n```\n:::\n';
    const out = convert(page);
    const lines = out.split('\n').filter((l) => l.includes("from '@astrojs/starlight/components'"));
    expect(lines).toHaveLength(1);
    const names = STARLIGHT_IMPORT.exec(out)?.[1]
      ?.split(',')
      .map((n) => n.trim());
    expect(names).toEqual(['Steps']);
    expect(out).toContain(IMPORT);
    compiles(out);
  });

  it('WP13.5 convert: <Steps> alone imports only Steps from Starlight', () => {
    const out = convert('# T\n\n<Steps>\n\n1. One.\n2. Two.\n\n</Steps>\n');
    expect(STARLIGHT_IMPORT.exec(out)?.[1]?.trim()).toBe('Steps');
    expect(outputExtension(out)).toBe('.mdx');
  });
});

describe('WP13.5 convert: authoring forms', () => {
  it('WP13.5 convert: <Description> inside a <Node> becomes <Description slot="description">', () => {
    const out = convert(
      '# T\n\n<Tree>\n  <Node name="packages/" icon="📦">\n    <Description>immutable packages</Description>\n  </Node>\n</Tree>\n',
    );
    expect(out).toContain('    <Description slot="description">immutable packages</Description>');
    expect(out).not.toMatch(/<Description>/);
    compiles(out);
  });

  it('WP13.5 convert: Vue :collapsible="false" binding becomes collapsible={false}', () => {
    const out = convert('# T\n\n<Tree :collapsible="false">\n  <Node name="a" />\n</Tree>\n');
    expect(out).toContain('<Tree collapsible={false}>');
    expect(out).not.toContain(':collapsible');
    compiles(out);
  });

  it('WP13.5 convert: Vue :platforms="[…]" binding becomes platforms={[…]}, plain attrs untouched', () => {
    const out = convert(`# T\n\n| sh | <PlatformIcons mode="os" :platforms="['windows','linux','darwin']" /> |\n`);
    expect(out).toContain(`<PlatformIcons mode="os" platforms={['windows','linux','darwin']} />`);
    compiles(out);
  });

  it('WP13.5 convert: boolean attrs (collapsed, open, flip) and open-icon are kept as written', () => {
    const page = [
      '# T',
      '',
      '<Terminal src="/casts/a.cast" title="A" collapsed />',
      '',
      '<Tree>',
      '  <Node name="{registry}/" icon="📁" open-icon="📂" open>',
      '    <Node name="x" />',
      '  </Node>',
      '</Tree>',
      '',
      '<FeatureSection title="Same Command" flip>',
      '  <template #text>',
      '',
      'Body.',
      '',
      '  </template>',
      '</FeatureSection>',
    ].join('\n');
    const out = convert(page);
    expect(out).toContain('<Terminal src="/casts/a.cast" title="A" collapsed />');
    expect(out).toContain('<Node name="{registry}/" icon="📁" open-icon="📂" open>');
    expect(out).toContain('<FeatureSection title="Same Command" flip>');
    compiles(out);
  });

  it('WP13.5 convert: <template #text> becomes <Fragment slot="text"> and its </template> </Fragment>', () => {
    const out = convert(
      '# T\n\n<FeatureSection title="X">\n  <template #text>\n\nBody **bold**.\n\n  </template>\n</FeatureSection>\n',
    );
    expect(out).toContain('<Fragment slot="text">');
    expect(out).toContain('</Fragment>');
    expect(out).not.toContain('template');
    expect(out.indexOf('<Fragment slot="text">')).toBeLessThan(out.indexOf('Body **bold**.'));
    expect(out.indexOf('Body **bold**.')).toBeLessThan(out.indexOf('</Fragment>'));
    compiles(out);
  });

  it('WP13.5 convert: Terminal src="/casts/…" is kept as is (the component resolves the base)', () => {
    const out = convert('# T\n\n<Terminal src="/casts/user-guide/deps.cast" title="Deps" collapsed />\n');
    expect(out).toContain('src="/casts/user-guide/deps.cast"');
    expect(outputExtension(out)).toBe('.mdx');
    compiles(out);
  });

  it('WP13.5 convert: <Steps> with a numbered list is kept as a Starlight <Steps> block', () => {
    const out = convert('# T\n\n<Steps>\n\n1. Publish a {pkg}.\n2. Sign it.\n\n</Steps>\n\nAfter.\n');
    const body = bodyLines(out).join('\n');
    expect(body).toMatch(/<Steps>\n\n1\. Publish a &#123;pkg&#125;\.\n2\. Sign it\.\n\n<\/Steps>/);
    compiles(out);
  });
});

describe('WP13.5 convert: MDX escaping around components', () => {
  it('WP13.5 convert: component tags and attributes are not escaped', () => {
    const out = convert(
      '# T\n\n<Tree>\n  <Node name="{registry}/" icon="📁" open>\n    <Node name="a" />\n  </Node>\n</Tree>\n',
    );
    expect(out).not.toMatch(/&#60;\/?(Tree|Node)/);
    expect(out).not.toContain('&#123;registry');
    expect(outputExtension(out)).toBe('.mdx');
    expect(out).toContain('  <Node name="{registry}/" icon="📁" open>');
    compiles(out);
  });

  it('WP13.5 convert: Description text is escaped while its inline HTML (<code>) is kept', () => {
    const out = convert(
      '# T\n\n<Tree>\n  <Node name="toolchain/">\n    <Description><code>{project}/.ocx/toolchain/</code> for a {project} and a < b</Description>\n  </Node>\n</Tree>\n',
    );
    const line = out.split('\n').find((l) => l.includes('<Description'));
    expect(line).toBe(
      '    <Description slot="description"><code>&#123;project&#125;/.ocx/toolchain/</code> for a &#123;project&#125; and a &#60; b</Description>',
    );
    compiles(out);
  });

  it('WP13.5 convert: an inline <Tooltip> mid-paragraph stays inline with its body escaped', () => {
    const out = convert(
      '# T\n\nPinned by <Tooltip term="OCI digest">A {sha} fingerprint, `{kept}` and a < b.</Tooltip>, not by ranges.\n',
    );
    const line = bodyLines(out).find((l) => l.startsWith('Pinned by'));
    expect(line).toBe(
      'Pinned by <Tooltip term="OCI digest">A &#123;sha&#125; fingerprint, `{kept}` and a &#60; b.</Tooltip>, not by ranges.',
    );
    compiles(out);
  });

  it('WP13.5 convert: a Tooltip body spanning lines (reference/metadata.md) compiles', () => {
    const out = convert(
      '# T\n\nthe graph is <Tooltip term="topologically sorted">\nKahn\'s algorithm with a {tiebreaker}.\nDependencies first.</Tooltip>, deduplicated.\n',
    );
    expect(out).toContain('<Tooltip term="topologically sorted">');
    expect(out).toContain('&#123;tiebreaker&#125;');
    compiles(out);
  });

  it('WP13.5 convert: unknown tags in prose are still escaped on component pages', () => {
    const out = convert('# T\n\n<Terminal src="/casts/a.cast" />\n\nUse <name> and {x} here.\n');
    expect(bodyLines(out)).toContain('Use &#60;name> and &#123;x&#125; here.');
    compiles(out);
  });
});

describe('WP13.5 convert: castRefs', () => {
  it('WP13.5 convert: castRefs lists each /casts/<path>.cast src once, in order, relative to /casts/', () => {
    const out = convert(
      '# T\n\n<Terminal src="/casts/b/two.cast" collapsed />\n\n<Terminal src="/casts/a/one.cast" />\n\n<Terminal src="/casts/b/two.cast" />\n',
    );
    expect(castRefs(out)).toEqual(['b/two.cast', 'a/one.cast']);
  });

  it('WP13.5 convert: castRefs ignores code fences, non-.cast srcs and fixture/ casts', () => {
    const out = convert(
      [
        '# T',
        '',
        '```md',
        '<Terminal src="/casts/fenced.cast" />',
        '```',
        '',
        '<Terminal src="/casts/fixture/demo.cast" />',
        '',
        '<img src="/casts/pic.png" alt="" />',
        '',
        '<Terminal src="/casts/real.cast" />',
      ].join('\n'),
    );
    expect(castRefs(out)).toEqual(['real.cast']);
  });

  it('WP13.5 convert: castRefs drops paths that could escape the casts dir (.., ., empty segments)', () => {
    const out = convert(
      [
        '# T',
        '<Terminal src="/casts/../../etc/x.cast" />',
        '<Terminal src="/casts/a/./b.cast" />',
        '<Terminal src="/casts//b.cast" />',
        '<Terminal src="/casts/ok/c.cast" />',
      ].join('\n\n'),
    );
    expect(castRefs(out)).toEqual(['ok/c.cast']);
  });

  it('WP13.5 convert: castRefs drops paths with characters outside [\\w./-] (backslash traversal on Windows)', () => {
    const out = convert(
      [
        '# T',
        '<Terminal src="/casts/a\\..\\..\\x.cast" />',
        '<Terminal src="/casts/a b.cast" />',
        '<Terminal src="/casts/ok/c.cast" />',
      ].join('\n\n'),
    );
    expect(castRefs(out)).toEqual(['ok/c.cast']);
  });
});

describe('WP13.5 convert: fetch.ts syncCasts', () => {
  let dir: string;
  let cache: string;
  let out: string;
  const bytes = (s: string) => Promise.resolve<Uint8Array | null>(new TextEncoder().encode(s));
  const put = async (path: string, text: string) => {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, text);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'wp13.5-casts-'));
    cache = join(dir, 'cache');
    out = join(dir, 'out');
    await put(join(out, 'fixture/demo.cast'), 'FIXTURE');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('WP13.5 convert: syncCasts downloads uncached casts from ocx.sh into the cache and copies them out (DOC-EX-12)', async () => {
    const download = vi.fn((url: string) => bytes(`cast of ${url}`));
    const { missing } = await syncCasts(['a/one.cast'], { cache, out, offline: false, download });
    expect(download).toHaveBeenCalledExactlyOnceWith(`${CASTS_ORIGIN}a/one.cast`);
    expect(CASTS_ORIGIN).toBe('https://ocx.sh/casts/');
    expect(await readFile(join(cache, 'a/one.cast'), 'utf8')).toBe(`cast of ${CASTS_ORIGIN}a/one.cast`);
    expect(await readFile(join(out, 'a/one.cast'), 'utf8')).toBe(`cast of ${CASTS_ORIGIN}a/one.cast`);
    expect(missing).toEqual([]);
  });

  it('WP13.5 convert: syncCasts reuses a cached cast without downloading', async () => {
    await put(join(cache, 'a/one.cast'), 'CACHED');
    const download = vi.fn(() => bytes('NEW'));
    await syncCasts(['a/one.cast'], { cache, out, offline: false, download });
    expect(download).not.toHaveBeenCalled();
    expect(await readFile(join(out, 'a/one.cast'), 'utf8')).toBe('CACHED');
  });

  it('WP13.5 convert: syncCasts --offline never hits the network; uncached casts are reported missing', async () => {
    await put(join(cache, 'a/one.cast'), 'CACHED');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const download = vi.fn(() => bytes('NEW'));
    const { missing } = await syncCasts(['a/one.cast', 'b/two.cast'], { cache, out, offline: true, download });
    expect(download).not.toHaveBeenCalled();
    expect(await readFile(join(out, 'a/one.cast'), 'utf8')).toBe('CACHED');
    expect(missing).toEqual(['b/two.cast']);
  });

  it('WP13.5 convert: syncCasts survives a 404, copies casts fetched before a later network error, prints one summary line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const download = vi.fn((url: string) => {
      if (url.endsWith('gone.cast')) return Promise.resolve(null);
      if (url.endsWith('boom.cast')) return Promise.reject(new Error('ECONNRESET'));
      return bytes('OK');
    });
    // ok.cast is fetched before the throw, so it still lands; boom.cast's throw then short-circuits the rest.
    const { missing } = await syncCasts(['gone.cast', 'ok.cast', 'boom.cast'], {
      cache,
      out,
      offline: false,
      download,
    });
    expect(missing).toEqual(['gone.cast', 'boom.cast']);
    expect(await readFile(join(out, 'ok.cast'), 'utf8')).toBe('OK');
    expect(existsSync(join(cache, 'gone.cast'))).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/\b2\b/);
  });

  it('WP13.5 convert: syncCasts removes stale fetched casts but never touches fixture/', async () => {
    await put(join(out, 'old/stale.cast'), 'STALE');
    await syncCasts(['a/one.cast'], { cache, out, offline: false, download: () => bytes('OK') });
    expect(existsSync(join(out, 'old/stale.cast'))).toBe(false);
    expect(await readFile(join(out, 'fixture/demo.cast'), 'utf8')).toBe('FIXTURE');
    expect((await readdir(out)).sort()).toEqual(['a', 'fixture']);
  });

  it('WP13.5 convert: syncCasts logs (not warns) the summary when nothing is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await syncCasts(['a/one.cast'], { cache, out, offline: false, download: () => bytes('OK') });
    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith('casts: 1 referenced, 0 missing');
  });

  it('WP13.5 convert: syncCasts stops trying more downloads after the first throws, reports the rest missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const download = vi.fn(() => Promise.reject(new Error('ECONNRESET')));
    const { missing } = await syncCasts(['a.cast', 'b.cast', 'c.cast'], { cache, out, offline: false, download });
    expect(download).toHaveBeenCalledOnce();
    expect(missing).toEqual(['a.cast', 'b.cast', 'c.cast']);
    expect(warn).toHaveBeenCalledExactlyOnceWith('casts: 3 referenced, 3 missing (download failed)');
  });
});

describe('WP13.5 convert: real ocx pages (smoke)', () => {
  const docs = fileURLToPath(new URL('../../.tmp/samples/ocx/website/src/docs/', import.meta.url));
  const pages: [string, string[]][] = [
    ['in-depth/storage.md', [imp('Tree'), imp('Node', 'TreeNode'), imp('Description', 'TreeDescription')]],
    ['faq.md', [imp('Tooltip')]],
    ['installation.md', [imp('PlatformIcons')]],
    ['in-depth/cosign-parity.md', [imp('Terminal'), 'Steps']],
    ['user-guide/patches.md', [imp('Terminal')]],
  ];
  for (const [page, needles] of pages) {
    const file = join(docs, page);
    // Samples are a dev aid pulled by `task samples`; CI has no cache.
    it(`WP13.5 convert: real ${page} converts to compiling MDX with its imports`, async (ctx) => {
      if (!existsSync(file)) return ctx.skip('samples not pulled — run task samples');
      const out = convert(await readFile(file, 'utf8'));
      expect(outputExtension(out)).toBe('.mdx');
      for (const needle of needles) expect(out).toContain(needle);
      expect(prose(out)).not.toMatch(/:(collapsible|platforms)=|<template|<Description>/);
      compiles(out);
    });
  }

  it('WP13.5 convert: castRefs on real user-guide/patches.md finds its three recordings', async (ctx) => {
    const file = join(docs, 'user-guide/patches.md');
    if (!existsSync(file)) return ctx.skip('samples not pulled — run task samples');
    const out = convert(await readFile(file, 'utf8'));
    expect(castRefs(out)).toEqual([
      'user-guide/patches-consumer.cast',
      'user-guide/patches-maintainer.cast',
      'user-guide/patches-test.cast',
    ]);
  });
});

describe('WP13.5 convert: inline code wrapping lines', () => {
  it('WP13.5 convert: inline code spans (double-backtick, or wrapped onto the next line) are not escaped', () => {
    const out = convert(
      '# T\n\n<Terminal src="/casts/a.cast" />\n\nSame as `` a `b` `` and `"source": { "kind": "patch",\n"rule": "x" }` and {y}.\n',
    );
    expect(out).toContain('Same as `` a `b` `` and `"source": { "kind": "patch",\n"rule": "x" }` and &#123;y&#125;.');
    compiles(out);
  });
});
