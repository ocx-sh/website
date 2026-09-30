// Starlight plugin contract (design §4.1, §4.3, §4.4; C-015…C-020, C-022, C-031).
// Tests run `config:setup` against a fake Starlight context and read the resolved
// config as Starlight would: the consumer's config with every `updateConfig` merged over it.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AstroIntegration, FontProvider } from 'astro';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { HookParameters, StarlightUserConfig } from '@astrojs/starlight/types';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import nav from '../src/nav.json' with { type: 'json' };
import { mergeTargets } from '../src/registry.mjs';
import type { Nav } from '../src/registry.mjs';
import { italicOptional } from '../src/starlight/fonts.mjs';
import ocxTheme from '../src/starlight/index.mjs';

type SetupContext = HookParameters<'config:setup'>;
type AstroConfig = SetupContext['astroConfig'];
type AstroSetup = Parameters<NonNullable<AstroIntegration['hooks']['astro:config:setup']>>[0];
type EcTheme = { tokenColors?: { settings?: { foreground?: string } }[] };
type EcOptions = {
  themes?: EcTheme[];
  styleOverrides?: Record<string, unknown> & { frames?: Record<string, unknown> };
};

const OVERRIDES = [
  'Head',
  'Header',
  'Footer',
  'PageTitle',
  'TableOfContents',
  'ThemeSelect',
  'MobileMenuFooter',
  'MarkdownContent',
  'Search',
  'Sidebar',
  'MobileMenuToggle',
  'PageFrame',
];
const CLAIMS = (nav as Nav).claims.map((c) => c.path);

/** Runs the plugin's `config:setup` hook; returns the resolved config and the context spies. */
async function setup(
  config: Partial<StarlightUserConfig> = {},
  astro: Partial<AstroConfig> = {},
  options?: Parameters<typeof ocxTheme>[0],
) {
  const userConfig = { title: 'Test', ...config } as StarlightUserConfig;
  const astroConfig = {
    base: '/docs/',
    site: undefined,
    trailingSlash: 'always',
    publicDir: pathToFileURL(join(tmpdir(), 'ocx-no-public/')),
    ...astro,
  } as AstroConfig;
  const updateConfig = vi.fn<SetupContext['updateConfig']>();
  const addIntegration = vi.fn<SetupContext['addIntegration']>();
  const addRouteMiddleware = vi.fn<SetupContext['addRouteMiddleware']>();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fork: vi.fn() };
  const ctx = {
    config: userConfig,
    astroConfig,
    updateConfig,
    addIntegration,
    addRouteMiddleware,
    command: 'build',
    isRestart: false,
    logger,
    useTranslations: vi.fn(),
    absolutePathToLang: vi.fn(() => 'en'),
  } as unknown as SetupContext;
  await ocxTheme(options).hooks['config:setup']?.(ctx);
  const resolved = updateConfig.mock.calls.reduce<StarlightUserConfig>((acc, [u]) => ({ ...acc, ...u }), userConfig);
  return { resolved, updateConfig, addIntegration, addRouteMiddleware, astroConfig, logger };
}

/** Runs every injected integration's `astro:config:setup`; returns the merged Astro config update. */
async function injected(
  addIntegration: Mock<SetupContext['addIntegration']>,
  astroConfig: AstroConfig,
  injectRoute = vi.fn<AstroSetup['injectRoute']>(),
) {
  const update = vi.fn<AstroSetup['updateConfig']>();
  for (const [integration] of addIntegration.mock.calls) {
    const ctx = {
      config: astroConfig,
      updateConfig: update,
      injectRoute,
      command: 'build',
      isRestart: false,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fork: vi.fn() },
    } as unknown as AstroSetup;
    await integration.hooks['astro:config:setup']?.(ctx);
  }
  return Object.assign({}, ...update.mock.calls.map(([u]) => u)) as {
    site?: string;
    vite?: {
      plugins?: { resolveId: (id: string) => string | undefined; load: (id: string) => string | undefined }[];
      optimizeDeps?: { include?: string[] };
      build?: { assetsInlineLimit?: (file: string, content: Buffer) => boolean | undefined };
      environments?: {
        client?: {
          build?: { rolldownOptions?: { output?: { codeSplitting?: { groups?: { name: string; test: RegExp }[] } } } };
        };
      };
    };
    fonts?: {
      name: string;
      cssVariable: string;
      provider: { name: string; resolveFont: (options: never) => unknown };
      fallbacks?: string[];
      optimizedFallbacks?: boolean;
      weights?: number[];
    }[];
  };
}

const ecOf = (resolved: StarlightUserConfig) => resolved.expressiveCode as EcOptions;

describe('ocxTheme plugin', () => {
  it('C-015: is a Starlight plugin named @ocx-sh/theme; its only option is breadcrumbs', () => {
    expect(ocxTheme().name).toBe('@ocx-sh/theme');
    expect(ocxTheme({ breadcrumbs: false }).name).toBe('@ocx-sh/theme');
    // @ts-expect-error unknown option
    expect(ocxTheme({ nope: 1 }).name).toBe('@ocx-sh/theme');
  });

  it.each([
    [undefined, { breadcrumbs: {} }],
    [{ breadcrumbs: false as const }, { breadcrumbs: false }],
    [{ breadcrumbs: { root: false as const } }, { breadcrumbs: { root: false } }],
    [
      { breadcrumbs: { root: { label: 'home', href: '/x/' } } },
      { breadcrumbs: { root: { label: 'home', href: '/x/' } } },
    ],
  ])('C-025: options %j reach the runtime as %j (virtual:ocx-theme/options)', async (options, runtime) => {
    const { addIntegration, astroConfig } = await setup({}, {}, options);
    const plugin = (await injected(addIntegration, astroConfig)).vite?.plugins?.[0];
    const id = plugin?.resolveId('virtual:ocx-theme/options');
    expect(id).toBe('\0virtual:ocx-theme/options');
    expect(plugin?.resolveId('other')).toBeUndefined();
    expect(plugin?.load(id ?? '')).toBe(`export default ${JSON.stringify(runtime)};`);
  });

  it('C-016: a base that is not a claim path throws, naming the base and every claim', async () => {
    const err = await setup({}, { base: '/nope/' }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain('/nope/');
    for (const path of CLAIMS) expect(err?.message).toContain(path);
  });

  it('C-016: a claim base without its trailing slash is accepted', async () => {
    await expect(setup({}, { base: '/docs' })).resolves.toBeDefined();
  });

  it('C-017: a foreign site throws, naming it and https://ocx.sh', async () => {
    await expect(setup({}, { site: 'https://example.com' })).rejects.toThrow(
      /https:\/\/example\.com[\s\S]*https:\/\/ocx\.sh|https:\/\/ocx\.sh[\s\S]*https:\/\/example\.com/,
    );
  });

  it('C-017: site https://ocx.sh (with or without trailing slash) is accepted', async () => {
    await expect(setup({}, { site: 'https://ocx.sh' })).resolves.toBeDefined();
    await expect(setup({}, { site: 'https://ocx.sh/' })).resolves.toBeDefined();
  });

  it("C-017: trailingSlash other than 'always' throws", async () => {
    await expect(setup({}, { trailingSlash: 'ignore' })).rejects.toThrow(/trailingSlash[\s\S]*always/);
  });

  it('only stylesheets under 750 B gzip inline (HTML_GZ_MAX), bigger sheets and the shared bundle link; non-CSS assets keep defaults; a consumer limit wins', async () => {
    const { addIntegration, astroConfig } = await setup();
    const limit = (await injected(addIntegration, astroConfig)).vite?.build?.assetsInlineLimit;
    // Random bytes do not compress, so gzip size ~ raw size; zeros would all inline.
    expect(limit?.('/a/Sidebar.css', randomBytes(600))).toBe(true);
    expect(limit?.('/a/badges.css', Buffer.alloc(3 * 1024))).toBe(true);
    expect(limit?.('/a/Select.css', randomBytes(6 * 1024))).toBe(false);
    expect(limit?.('/a/common.css', randomBytes(116 * 1024))).toBe(false);
    expect(limit?.('/a/logo.png', Buffer.alloc(100))).toBeUndefined();
    const own = { ...astroConfig, vite: { build: { assetsInlineLimit: 0 } } } as AstroConfig;
    expect((await injected(addIntegration, own)).vite?.build).toBeUndefined();
  });

  it('every-page chunk: the trigger layer, the preload helper and starlight-toc share one client chunk; a consumer split wins', async () => {
    const { addIntegration, astroConfig } = await setup();
    const split = (await injected(addIntegration, astroConfig)).vite?.environments?.client?.build?.rolldownOptions
      ?.output?.codeSplitting;
    const [group] = split?.groups ?? [];
    expect(group?.name).toBe('zag');
    for (const id of [
      '/w/packages/theme/src/components/ui/zag.mjs',
      '\0vite/preload-helper.js',
      '/w/node_modules/@astrojs/starlight/dist/components-internals/TableOfContents/starlight-toc.js',
    ])
      expect(group?.test.test(id), id).toBe(true);
    for (const id of ['/w/packages/theme/src/components/ui/zag-runtime.mjs', '/w/src/components/tabs.zag.mjs'])
      expect(group?.test.test(id), id).toBe(false);
    for (const vite of [
      { environments: { client: { build: { rolldownOptions: { output: { codeSplitting: false } } } } } },
      { build: { rolldownOptions: { output: { codeSplitting: false } } } },
      { build: { rollupOptions: { output: { manualChunks: {} } } } },
      { build: { rolldownOptions: { output: [{}, {}] } } },
    ]) {
      const own = { ...astroConfig, vite } as unknown as AstroConfig;
      expect((await injected(addIntegration, own)).vite?.environments, JSON.stringify(vite)).toBeUndefined();
    }
  });

  it('dev server pre-bundles every lazy dependency (@zag-js, asciinema-player), nested under the theme (pnpm-safe)', async () => {
    const { addIntegration, astroConfig } = await setup();
    const include = (await injected(addIntegration, astroConfig)).vite?.optimizeDeps?.include;
    const lazy = Object.keys(pkg.dependencies).filter((d) => d.startsWith('@zag-js/') || d === 'asciinema-player');
    expect(lazy).toContain('@zag-js/toast');
    expect(lazy).toContain('asciinema-player');
    expect(include).toEqual(lazy.map((d) => `@ocx-sh/theme > ${d}`));
  });

  it('C-017: the injected integration sets site https://ocx.sh and the two fontsource families', async () => {
    const { addIntegration, astroConfig } = await setup();
    expect(addIntegration).toHaveBeenCalled();
    const update = await injected(addIntegration, astroConfig);
    expect(update.site).toBe('https://ocx.sh');
    const fonts = update.fonts ?? [];
    expect(fonts.map((f) => f.name).sort()).toEqual(['IBM Plex Mono', 'IBM Plex Sans']);
    for (const f of fonts) expect(f.provider.name).toBe('fontsource');
    // The cssVariable is what binds the faces to the theme font tokens (and Head.astro's <Font>).
    expect(fonts.map((f) => f.cssVariable).sort()).toEqual(['--ocx-font-mono', '--ocx-font-sans']);
  });

  it('italic faces get font-display: optional, upright faces keep the family default', async () => {
    const face = (style: string) => ({ src: [{ name: 'x' }], style, weight: 400 });
    const stub = { name: 'stub', resolveFont: () => Promise.resolve({ fonts: [face('normal'), face('italic')] }) };
    const wrapped = italicOptional(stub as unknown as FontProvider);
    expect(wrapped.name).toBe('stub');
    const resolved = await wrapped.resolveFont({} as never);
    expect(Object.fromEntries((resolved?.fonts ?? []).map((x) => [x.style, x.display]))).toEqual({
      normal: undefined,
      italic: 'optional',
    });
    // The plugin registers the wrapper, not the bare fontsource provider, and sets no family-wide display.
    const { addIntegration, astroConfig } = await setup();
    for (const f of (await injected(addIntegration, astroConfig)).fonts ?? []) {
      expect((f as { display?: unknown }).display).toBeUndefined();
      expect(f.provider.resolveFont.name).toBe('resolveFont');
      expect(f.provider.resolveFont.toString()).toContain('optional');
    }
  });

  it('font fallbacks are the theme metric faces, not the Arial/Courier New-only Astro ones', async () => {
    const { addIntegration, astroConfig } = await setup();
    const fonts = (await injected(addIntegration, astroConfig)).fonts ?? [];
    const byVar = Object.fromEntries(fonts.map((f) => [f.cssVariable, f]));
    expect(byVar['--ocx-font-sans']?.fallbacks?.[0]).toBe('OCX Sans Fallback');
    expect(byVar['--ocx-font-mono']?.fallbacks?.[0]).toBe('OCX Mono Fallback');
    for (const f of fonts) expect(f.optimizedFallbacks).toBe(false);
    // Four faces in all (Lighthouse font budget); tokens.css maps medium/bold onto them.
    for (const f of fonts) expect(f.weights).toEqual([400, 600]);
    // Arial- and Courier-metric-compatible faces present on Windows, macOS, Linux and Android.
    const css = readFileSync(fileURLToPath(new URL('../src/base.css', import.meta.url)), 'utf8');
    for (const name of ['Arial', 'Liberation Sans', 'Arimo', 'Nimbus Sans', 'Arial Bold', 'Liberation Sans Bold'])
      expect(css).toContain(`local("${name}")`);
    for (const name of ['Courier New', 'Liberation Mono', 'Cousine', 'Nimbus Mono PS'])
      expect(css).toContain(`local("${name}")`);
    expect(css.match(/font-family: "OCX (Sans|Mono) Fallback"/g)?.length).toBe(3);
  });

  it('the logo is the default favicon when the consumer ships none', async () => {
    const { addIntegration, astroConfig } = await setup();
    const injectRoute = vi.fn<AstroSetup['injectRoute']>();
    await injected(addIntegration, astroConfig, injectRoute);
    expect(injectRoute).toHaveBeenCalledWith(expect.objectContaining({ pattern: '/favicon.svg', prerender: true }));
    const entry = String(injectRoute.mock.calls[0]?.[0].entrypoint);
    expect(isAbsolute(entry) && !entry.includes('\\')).toBe(true);
    const { GET } = (await import(entry)) as { GET: () => Response };
    const res = GET();
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(await res.text()).toBe(readFileSync(fileURLToPath(new URL('../src/logo.svg', import.meta.url)), 'utf8'));
  });

  it('a consumer favicon (config or public/favicon.svg) wins over the default', async () => {
    const own = await setup({ favicon: '/brand.png' });
    const a = vi.fn<AstroSetup['injectRoute']>();
    await injected(own.addIntegration, own.astroConfig, a);
    expect(a).not.toHaveBeenCalled();
    const dir = mkdtempSync(join(tmpdir(), 'ocx-public-'));
    writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
    const pub = await setup({}, { publicDir: pathToFileURL(`${dir}/`) });
    const b = vi.fn<AstroSetup['injectRoute']>();
    await injected(pub.addIntegration, pub.astroConfig, b);
    expect(b).not.toHaveBeenCalled();
    rmSync(dir, { recursive: true });
  });

  it('C-018: customCss is tokens, base, starlight.css, then the consumer entries', async () => {
    const theme = ['@ocx-sh/theme/tokens.css', '@ocx-sh/theme/base.css', '@ocx-sh/theme/starlight.css'];
    expect((await setup()).resolved.customCss).toEqual(theme);
    const { resolved } = await setup({ customCss: ['./src/a.css', './src/b.css'] });
    expect(resolved.customCss).toEqual([...theme, './src/a.css', './src/b.css']);
  });

  it('C-019/C-107: components carry every override by specifier', async () => {
    const { resolved } = await setup();
    expect(resolved.components).toMatchObject(
      Object.fromEntries(OVERRIDES.map((n) => [n, `@ocx-sh/theme/starlight/${n}.astro`])),
    );
  });

  it('C-019: a consumer component key keeps the consumer value', async () => {
    const { resolved } = await setup({
      components: { Header: './src/MyHeader.astro', Sidebar: './src/MySidebar.astro', Search: './src/S.astro' },
    });
    expect(resolved.components?.Search).toBe('./src/S.astro');
    expect(resolved.components?.Header).toBe('./src/MyHeader.astro');
    expect(resolved.components?.Sidebar).toBe('./src/MySidebar.astro');
    expect(resolved.components?.Footer).toBe('@ocx-sh/theme/starlight/Footer.astro');
  });

  it('a consumer Search override warns once, naming the nav, drawer, sidebar collapsibles and toaster', async () => {
    const { logger } = await setup({ components: { Search: './src/S.astro' } });
    expect(logger.warn).toHaveBeenCalledOnce();
    const [message] = logger.warn.mock.calls[0] as [string];
    for (const part of ['nav', 'drawer', 'sidebar collapsibles', 'toaster', 'Search.astro'])
      expect(message).toContain(part);
    expect((await setup({ components: { Header: './src/H.astro' } })).logger.warn).not.toHaveBeenCalled();
  });

  it('route middleware is registered by absolute forward-slash path to route-middleware.mjs', async () => {
    const { addRouteMiddleware } = await setup();
    expect(addRouteMiddleware).toHaveBeenCalledTimes(1);
    const entrypoint = addRouteMiddleware.mock.calls[0]?.[0].entrypoint ?? '';
    expect(entrypoint).toMatch(/route-middleware\.mjs$/);
    expect(entrypoint).not.toContain('\\');
    expect(isAbsolute(entrypoint)).toBe(true);
    expect(existsSync(entrypoint)).toBe(true);
  });

  it('C-020: mergeIndex is the search claims minus the own, as Pagefind bundles', async () => {
    const { resolved } = await setup();
    const pagefind = resolved.pagefind as Exclude<StarlightUserConfig['pagefind'], boolean | undefined>;
    const expected = mergeTargets(nav as Nav, '/docs/').map((t) => ({
      bundlePath: `${t.path}pagefind/`,
      mergeFilter: { section: t.label },
      indexWeight: 1,
    }));
    expect(expected.length).toBeGreaterThan(0);
    expect(pagefind.mergeIndex).toEqual(expected);
    expect(pagefind.mergeIndex?.map((m) => m.bundlePath)).not.toContain('/docs/pagefind/');
  });

  it('C-020: consumer pagefind: false is preserved', async () => {
    expect((await setup({ pagefind: false })).resolved.pagefind).toBe(false);
  });

  it('C-020: consumer mergeIndex entries are appended without duplicate bundlePath; other keys kept', async () => {
    const ranking = { termFrequency: 0.5 };
    const extra = { bundlePath: 'https://example.com/pagefind/' };
    const { resolved } = await setup({
      pagefind: { ranking, mergeIndex: [{ bundlePath: '/pagefind/', indexWeight: 9 }, extra] },
    });
    const pagefind = resolved.pagefind as Exclude<StarlightUserConfig['pagefind'], boolean | undefined>;
    const theme = mergeTargets(nav as Nav, '/docs/').map((t) => ({
      bundlePath: `${t.path}pagefind/`,
      mergeFilter: { section: t.label },
      indexWeight: 1,
    }));
    expect(pagefind.mergeIndex).toEqual([...theme, extra]);
    expect(pagefind.ranking).toEqual(ranking);
  });

  it('C-022: consumer expressiveCode: false is preserved', async () => {
    expect((await setup({ expressiveCode: false })).resolved.expressiveCode).toBe(false);
  });

  it('C-022: default is one token-mapped theme, no terminal dots, focus-token borders', async () => {
    const ec = ecOf((await setup()).resolved);
    expect(ec.themes).toHaveLength(1);
    const foregrounds = (ec.themes?.[0]?.tokenColors ?? []).map((t) => t.settings?.foreground ?? '');
    expect(foregrounds.some((f) => f.includes('var(--ocx-color-code-'))).toBe(true);
    expect(ec.styleOverrides?.frames?.terminalTitlebarDotsOpacity).toBe('0');
    expect(String(ec.styleOverrides?.focusBorder)).toContain('--ocx-color-focus');
  });

  it('C-022: a consumer styleOverrides key wins; the rest merge one level deep (incl. frames)', async () => {
    const defaults = ecOf((await setup()).resolved);
    const styleOverrides = { borderRadius: '0' };
    const ec = ecOf((await setup({ expressiveCode: { styleOverrides } })).resolved);
    expect(ec.styleOverrides?.borderRadius).toBe('0');
    expect(ec.styleOverrides?.codeBackground).toBe(defaults.styleOverrides?.codeBackground);
    expect(ec.styleOverrides?.frames?.terminalTitlebarDotsOpacity).toBe('0');
    expect(ec.themes).toEqual(defaults.themes);
  });
});

describe('C-031: package surface (declared)', () => {
  const pkgDir = fileURLToPath(new URL('../', import.meta.url));
  const exportsMap: Record<string, string | Record<string, string>> = pkg.exports;

  it('C-031: exports keys are exactly the §4.1 list', () => {
    expect(Object.keys(exportsMap).sort()).toEqual(
      [
        './tokens.css',
        './base.css',
        './fonts.css',
        './starlight.css',
        './starlight',
        './starlight/*.astro',
        './components/*.astro',
        './nav.json',
        './nav',
        './vitepress',
        './logo.svg',
        './icons',
        './toast',
        './toaster',
        './cycle-button',
      ].sort(),
    );
  });

  it('C-031: JS exports put types first and default last, types beside the .mjs', () => {
    for (const key of ['./starlight', './nav', './icons', './toast', './toaster', './cycle-button']) {
      const cond = exportsMap[key] as Record<string, string>;
      const names = Object.keys(cond);
      expect(names[0]).toBe('types');
      expect(names.at(-1)).toBe('default');
      // A .d.mts is prepack's output (gitignored); a hand-written .d.ts sibling is committed.
      const types = cond.types ?? '';
      expect([cond.default?.replace(/\.mjs$/, '.d.mts'), cond.default?.replace(/\.mjs$/, '.d.ts')]).toContain(types);
      expect(types.endsWith('.d.mts') || existsSync(join(pkgDir, types))).toBe(true);
    }
  });

  it('C-031: every export target exists; wildcards match at least one file', () => {
    for (const value of Object.values(exportsMap)) {
      const target = typeof value === 'string' ? value : (value.default ?? '');
      if (target.includes('*')) {
        const [dir = '', suffix = ''] = target.split('*');
        expect(readdirSync(join(pkgDir, dir)).filter((f) => f.endsWith(suffix)).length, target).toBeGreaterThan(0);
      } else {
        expect(existsSync(join(pkgDir, target)), target).toBe(true);
      }
    }
  });

  it('C-031: the dts build emits starlight/index.d.mts and nav.d.mts', () => {
    const out = mkdtempSync(join(tmpdir(), 'ocx-dts-'));
    try {
      // Via node, not the .bin shim, so it also runs on Windows.
      const tsc = fileURLToPath(import.meta.resolve('typescript/bin/tsc'));
      execFileSync(process.execPath, [tsc, '-p', join(pkgDir, 'tsconfig.dts.json'), '--outDir', out], {
        stdio: 'pipe',
        timeout: 110_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      expect(existsSync(join(out, 'starlight/index.d.mts'))).toBe(true);
      expect(existsSync(join(out, 'nav.d.mts'))).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);

  it('C-031: files, bin and peers', () => {
    expect(pkg.files).toEqual(['src', 'bin', 'THIRD_PARTY_NOTICES']);
    expect(existsSync(join(pkgDir, pkg.bin['ocx-site']))).toBe(true);
    expect(pkg.peerDependencies).toEqual({ '@astrojs/starlight': '>=0.42.0 <0.43', astro: '^7' });
  });
});

describe('C-107 override stubs', () => {
  type Component = Parameters<AstroContainer['renderToString']>[0];
  const t = Object.assign((key: string) => key, { all: () => ({}) });
  const locals = { t, starlightRoute: { hasSidebar: true, sidebar: [] } } as unknown as App.Locals;
  const slots = { header: '<b>h</b>', sidebar: '<i>s</i>', default: '<p>main</p>' };

  // Search (Z10), Sidebar and MobileMenuToggle (Z12) left the list: search.test.ts, sidebar.test.ts.
  // PageFrame stays Starlight's; the mobile drawer drives its pane as it stands (C-231).
  it.each(['PageFrame'])('%s renders exactly what Starlight’s default renders', async (name) => {
    const container = await AstroContainer.create();
    const load = async (spec: string) => ((await import(/* @vite-ignore */ spec)) as { default: Component }).default;
    const render = async (spec: string) =>
      container.renderToString(await load(spec), { request: new Request('https://ocx.sh/docs/x/'), locals, slots });
    const ours = await render(`../src/starlight/${name}.astro`);
    expect(ours).toBe(await render(`@astrojs/starlight/components/${name}.astro`));
    expect(ours.length).toBeGreaterThan(0);
  });
});
