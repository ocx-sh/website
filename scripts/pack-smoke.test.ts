import { describe, expect, test } from 'vitest';
import { checkExports, checkFixture } from './pack-smoke.mjs';

// C-031: checkExports is the pure, unit-testable part of pack-smoke.mjs.
// A §4.1-exact package.json and the tarball file list it ships.
const pkg = () => ({
  exports: {
    './tokens.css': './src/tokens.css',
    './base.css': './src/base.css',
    './fonts.css': './src/fonts.css',
    './starlight.css': './src/starlight/starlight.css',
    './starlight': { types: './src/starlight/index.d.mts', default: './src/starlight/index.mjs' },
    './starlight/*.astro': './src/starlight/*.astro',
    './components/*.astro': './src/components/*.astro',
    './layouts/*.astro': './src/layouts/*.astro',
    './chrome': { types: './src/chrome.d.mts', default: './src/chrome.mjs' },
    './nav.json': './src/nav.json',
    './nav': { types: './src/nav.d.mts', default: './src/nav.mjs' },
    './vitepress': './src/vitepress/vitepress.css',
    './logo.svg': './src/logo.svg',
    './icons': { types: './src/icons/icons.d.ts', default: './src/icons/icons.mjs' },
    './toast': { types: './src/components/toast.d.mts', default: './src/components/toast.mjs' },
    './toaster': { types: './src/starlight/toaster.d.mts', default: './src/starlight/toaster.mjs' },
    './cycle-button': {
      types: './src/components/ui/cycle-button.d.mts',
      default: './src/components/ui/cycle-button.mjs',
    },
    './prose-code.css': './src/prose-code.css',
    './lazy': { types: './src/components/ui/lazy.d.mts', default: './src/components/ui/lazy.mjs' },
    './csp': { types: './src/csp.d.mts', default: './src/csp.mjs' },
  } as Record<string, string | Record<string, string>>,
  bin: { 'ocx-site': './bin/ocx-site.mjs' },
});
const FILES = [
  'package.json',
  'bin/ocx-site.mjs',
  'src/tokens.css',
  'src/base.css',
  'src/fonts.css',
  'src/starlight/starlight.css',
  'src/starlight/index.mjs',
  'src/starlight/index.d.mts',
  'src/starlight/Header.astro',
  'src/components/EcosystemMenu.astro',
  'src/layouts/Shell.astro',
  'src/chrome.mjs',
  'src/chrome.d.mts',
  'src/nav.json',
  'src/nav.mjs',
  'src/nav.d.mts',
  'src/vitepress/vitepress.css',
  'src/logo.svg',
  'src/icons/icons.mjs',
  'src/icons/icons.d.ts',
  'src/components/toast.mjs',
  'src/components/toast.d.mts',
  'src/starlight/toaster.mjs',
  'src/starlight/toaster.d.mts',
  'src/components/ui/cycle-button.mjs',
  'src/components/ui/cycle-button.d.mts',
  'src/prose-code.css',
  'src/components/ui/lazy.mjs',
  'src/components/ui/lazy.d.mts',
  'src/csp.mjs',
  'src/csp.d.mts',
];

test('C-031 exactly the §4.1 export key set passes with no problems', () => {
  expect(checkExports(pkg(), FILES)).toEqual([]);
});

test('C-031 an extra or missing export key is flagged', () => {
  const extra = pkg();
  extra.exports['./extra.css'] = './src/tokens.css';
  expect(checkExports(extra, FILES).join('\n')).toContain('./extra.css');
  const missing = pkg();
  delete missing.exports['./logo.svg'];
  expect(checkExports(missing, FILES).join('\n')).toContain('./logo.svg');
});

test("C-031 an export key whose target isn't in the tarball's file list is flagged", () => {
  expect(
    checkExports(
      pkg(),
      FILES.filter((f) => f !== 'src/base.css'),
    ).join('\n'),
  ).toContain('./base.css');
  // A wildcard key with zero matching files resolves to nothing.
  expect(
    checkExports(
      pkg(),
      FILES.filter((f) => !f.startsWith('src/components/')),
    ).join('\n'),
  ).toContain('./components/*.astro');
});

test('C-031 a JS export (object condition) missing a `types` condition is flagged', () => {
  const p = pkg();
  p.exports['./nav'] = { default: './src/nav.mjs' };
  expect(checkExports(p, FILES).join('\n')).toContain('./nav');
});

test('C-031 a hand-written .d.ts types sibling passes only when it ships; any other types extension fails', () => {
  expect(
    checkExports(
      pkg(),
      FILES.filter((f) => f !== 'src/icons/icons.d.ts'),
    ).join('\n'),
  ).toContain('./icons');
  const p = pkg();
  p.exports['./icons'] = { types: './src/icons/icons.mjs', default: './src/icons/icons.mjs' };
  expect(checkExports(p, FILES).join('\n')).toContain('export ./icons: JS export has no `types`');
});

test("C-031 a JS export's `types` .d.mts not present in `files` is flagged", () => {
  expect(
    checkExports(
      pkg(),
      FILES.filter((f) => f !== 'src/starlight/index.d.mts'),
    ).join('\n'),
  ).toContain('index.d.mts');
});

test('C-031 a stray .ts file in the tarball is flagged', () => {
  expect(checkExports(pkg(), [...FILES, 'src/nav.ts']).join('\n')).toContain('src/nav.ts');
  // .d.mts declarations are not .ts source.
  expect(checkExports(pkg(), FILES)).toEqual([]);
});

test("C-031 a missing bin ocx-site, or one whose target isn't in the tarball, is flagged", () => {
  expect(
    checkExports(
      pkg(),
      FILES.filter((f) => f !== 'bin/ocx-site.mjs'),
    ).join('\n'),
  ).toContain('ocx-site');
  const p = pkg();
  p.bin = {} as typeof p.bin;
  expect(checkExports(p, FILES).join('\n')).toContain('ocx-site');
});

// C-124 / S-106: checkFixture is the pure part of the consumer-fixture render check.
describe('C-124 checkFixture', () => {
  const Foo = `---\ninterface Props { a: string }\n---\n<div class:list={['ocx-foo', c]} />`;
  const Zag = `---\n---\n<div class="ocx-zag" data-zag-root="tabs" />`;
  const chrome = '<site-search id="starlight__search"></site-search><button class="sl-menu-button"></button>';
  const fooPage = 'import Foo from \'@ocx-sh/theme/components/Foo.astro\';\n\n<Foo a="1" />\n';
  const zagPage =
    "import Zag from '@ocx-sh/theme/components/ui/Zag.astro';\n\n<Zag />\n\n<Zag />\n\n```mdx\n<Zag />\n```\n";
  const base = () => ({
    components: { 'Foo.astro': Foo, 'ui/Zag.astro': Zag, 'Hidden.astro': Foo } as Record<string, string>,
    pages: { foo: fooPage, zag: zagPage } as Record<string, string>,
    html: {
      foo: `${chrome}<div class="ocx-foo astro-x">x</div>`,
      zag: `${chrome}<div class="ocx-zag" data-zag-root="tabs"></div><div class="ocx-zag" data-zag-root="tabs"></div>`,
    } as Record<string, string | undefined>,
    exempt: ['Hidden.astro'],
  });

  test('C-124 every component imported and rendered passes', () => {
    expect(checkFixture(base())).toEqual([]);
  });

  test('S-106 an exported component no copied page imports fails naming it', () => {
    const input = base();
    input.components['ui/New.astro'] = Foo;
    expect(checkFixture(input).join('\n')).toContain('ui/New.astro');
  });

  test('S-106 a page whose build lacks the component fails naming component and page', () => {
    const input = base();
    input.html.foo = `${chrome}<p>empty</p>`;
    const problems = checkFixture(input).join('\n');
    expect(problems).toContain('Foo.astro');
    expect(problems).toContain('foo');
    const unbuilt = base();
    delete unbuilt.html.foo;
    expect(checkFixture(unbuilt).join('\n')).toContain('foo');
  });

  test('C-124 the root class must match a whole class token (ocx-foo-x is not ocx-foo)', () => {
    const input = base();
    input.html.foo = `${chrome}<div class="ocx-foo-x">x</div>`;
    expect(checkFixture(input).join('\n')).toContain('Foo.astro');
  });

  test('C-124 a Zag-backed component needs a [data-zag-root] per use (code fences do not count)', () => {
    const input = base();
    input.html.zag = `${chrome}<div class="ocx-zag" data-zag-root="tabs"></div>`;
    expect(checkFixture(input).join('\n')).toContain('ui/Zag.astro');
  });

  test('C-124 a conditional Zag root (TagGroup) counts only its selectable uses, found below the wrapper', () => {
    const TagGroup = `---\n---\n<div class:list={['ocx-ui-field', c]}>{api ? (<div class="ocx-ui-tag-group" data-zag-root="tag-group" />) : (<ul class="ocx-ui-tag-group" />)}</div>`;
    const input = base();
    input.components['ui/TagGroup.astro'] = TagGroup;
    input.pages.tags =
      "import TagGroup from '@ocx-sh/theme/components/ui/TagGroup.astro';\n\n" +
      '<TagGroup label="a" selectionMode="multiple" items={x} />\n\n<TagGroup\n  label="b"\n  selectionMode="single"\n  items={x}\n/>\n\n<TagGroup label="c" removable items={x} />\n';
    const field = (inner: string) => `<div class="ocx-ui-field ocx-ui-tag-group-field">${inner}</div>`;
    const root = '<div class="ocx-ui-tag-group" data-zag-root="tag-group"></div>';
    input.html.tags = `${chrome}${field(root)}${field(root)}${field('<ul class="ocx-ui-tag-group"></ul>')}`;
    expect(checkFixture(input)).toEqual([]);
    input.html.tags = `${chrome}${field(root)}${field('<ul class="ocx-ui-tag-group"></ul>')}${field('<ul class="ocx-ui-tag-group"></ul>')}`;
    expect(checkFixture(input).join('\n')).toContain('ui/TagGroup.astro: page tags uses it 2× but renders 1');
  });

  test('C-124 a dynamic root name (Choice) is matched by class, and a static name in a <script> is ignored', () => {
    const Choice = `---\n---\n<div class="ocx-ui-choice" data-zag-root={type} />\n<script>el.matches('[data-zag-root="checkbox"], [data-zag-root="switch"]')</script>`;
    const input = base();
    input.components['ui/Choice.astro'] = Choice;
    input.pages.choice =
      'import Choice from \'@ocx-sh/theme/components/ui/Choice.astro\';\n\n<Choice />\n\n<Choice type="switch" />\n';
    input.html.choice = `${chrome}<div class="ocx-ui-choice" data-zag-root="checkbox"></div><div class="ocx-ui-choice" data-zag-root="switch"></div>`;
    expect(checkFixture(input)).toEqual([]);
    input.html.choice = `${chrome}<div class="ocx-ui-choice" data-zag-root="checkbox"></div>`;
    expect(checkFixture(input).join('\n')).toContain('ui/Choice.astro: page choice uses it 2× but renders 1');
  });

  test('C-124 a CommandBar use with choices={[]} renders no root; any other choices does', () => {
    const CommandBar = `---\n---\n{first && (<div class="ocx-ui-command-bar" data-zag-root="clipboard" />)}`;
    const input = base();
    input.components['ui/CommandBar.astro'] = CommandBar;
    input.pages.bar =
      "import CommandBar from '@ocx-sh/theme/components/ui/CommandBar.astro';\n\n<CommandBar choices={[]}>\n  <a>go</a>\n</CommandBar>\n\n<CommandBar choices={install}>x</CommandBar>\n\n<CommandBar choices={[scope[0]]}>x</CommandBar>\n";
    const root = '<div class="ocx-ui-command-bar" data-zag-root="clipboard"></div>';
    input.html.bar = `${chrome}${root}${root}`;
    expect(checkFixture(input)).toEqual([]);
    input.html.bar = `${chrome}${root}`;
    expect(checkFixture(input).join('\n')).toContain('ui/CommandBar.astro: page bar uses it 2× but renders 1');
  });

  test('C-124 the chrome overrides must render (#starlight__search, .sl-menu-button)', () => {
    const input = base();
    input.html.foo = '<div class="ocx-foo"></div>';
    const problems = checkFixture(input).join('\n');
    expect(problems).toContain('#starlight__search');
    expect(problems).toContain('.sl-menu-button');
  });

  test('C-125 a component shown only in a story is asserted on its built story page, without chrome', () => {
    const input = base();
    input.components['ui/Storied.astro'] = Zag.replace('ocx-zag', 'ocx-storied');
    const stories = { 'storied/default': "import S from '@ocx-sh/theme/components/ui/Storied.astro';\n\n<S />\n" };
    const good = { 'storied/default': '<div class="ocx-storied" data-zag-root="tabs"></div>' };
    expect(checkFixture({ ...input, stories, storyHtml: good })).toEqual([]);
    const problems = checkFixture({ ...input, stories, storyHtml: { 'storied/default': '<p>empty</p>' } }).join('\n');
    expect(problems).toContain('ui/Storied.astro: page stories/storied/default built without it');
    expect(checkFixture({ ...input, stories, storyHtml: {} }).join('\n')).toContain('stories/storied/default');
  });
});
