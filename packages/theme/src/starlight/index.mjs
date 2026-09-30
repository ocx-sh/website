// Public `@ocx-sh/theme/starlight` entry: the Starlight plugin (design §4.3).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { fontProviders } from 'astro/config';
import pkg from '../../package.json' with { type: 'json' };
import nav from '../nav.json' with { type: 'json' };
import { mergeTargets } from '../registry.mjs';
import { EXPRESSIVE_CODE } from './ec.mjs';
import { italicOptional } from './fonts.mjs';

const SITE = 'https://ocx.sh';
const INDEX_WEIGHT = 1;
// Gzip bytes, the unit HTML_GZ_MAX (~14 KB, Lighthouse's first round trip) is paid in. Every
// stylesheet request before first paint queues behind the preloaded fonts in Lighthouse's
// six-connection simulation: 5+ blocking sheets put LCP a round trip late (0.99). 750 inlines
// Starlight's badges/cards/steps and PlatformIcons, not Tag (790), which pushed
// iconography/os past the cap. Measured headroom: largest page cards 14,024 B (176 B left).
const INLINE_CSS_MAX = 750;
// Client chunk group of the modules every docs page imports from its entry scripts: the Zag trigger
// layer (Search.astro's script, C-113), Vite's preload helper (every lazy import) and Starlight's
// `starlight-toc` (both TOC scripts). ponytail: matched by path; if Starlight moves the TOC module,
// it drops back to its own chunk (one request more, nothing breaks).
const EVERY_PAGE = {
  name: 'zag',
  test: /[\\/]components[\\/]ui[\\/]zag\.mjs$|vite[\\/]preload-helper|[\\/]TableOfContents[\\/]starlight-toc\.js$/,
};
// Every dependency the theme lazy-loads (Zag machines, the asciinema player), pre-bundled by the dev
// server: discovered only on first hover/focus/play, Vite re-optimized and the browser got 504
// "Outdated Optimize Dep" (no lazy component started; "The recording could not be loaded").
// Nested `@ocx-sh/theme > dep`: under pnpm they resolve from the theme, not the consumer root.
// Derived from package.json so a new machine cannot be forgotten.
const ZAG_DEPS = Object.keys(pkg.dependencies)
  .filter((d) => d.startsWith('@zag-js/') || d === 'asciinema-player')
  .map((d) => `${pkg.name} > ${d}`);
/** @typedef {{ codeSplitting?: unknown, manualChunks?: unknown } | unknown[] | undefined} Output */
/**
 * Whether the theme may set the client build's code splitting: not when the consumer set its own
 * (`codeSplitting` on the client environment or top-level `build.rolldownOptions`, or Rollup-style
 * `manualChunks`) or several outputs.
 * @param {{ environments?: Record<string, { build?: { rolldownOptions?: { output?: Output } } }>,
 *   build?: { rolldownOptions?: { output?: Output }, rollupOptions?: { output?: Output } } } | undefined} vite
 */
const ownSplitting = (vite) =>
  [
    vite?.environments?.['client']?.build?.rolldownOptions?.output,
    vite?.build?.rolldownOptions?.output,
    vite?.build?.rollupOptions?.output,
  ].every(
    (o) => o === undefined || (!Array.isArray(o) && o.codeSplitting === undefined && o.manualChunks === undefined),
  );
// Search.astro's every-page script also mounts the header section nav, the sidebar groups, the
// mobile menu drawer (C-192, C-230, C-231) and the toaster (C-181, Expressive Code copy toasts
// included): overriding Search drops all four unless the override runs that script too — nav and
// mobile menu fall back to native popovers, nested sidebar groups show open, no toasts. Warned below.
const SEARCH_WARNING =
  "components.Search is overridden: the theme's Search.astro script also mounts the header nav menu, " +
  'the mobile menu drawer, the sidebar collapsibles and the toaster (incl. copy toasts). Without it they fall ' +
  "back to native popovers, open sidebar groups and no toasts; copy the <script> of @ocx-sh/theme's " +
  'starlight/Search.astro into your override to keep them.';
const OVERRIDES = [
  'Head',
  'Header',
  'Footer',
  'PageTitle',
  'TableOfContents',
  'ThemeSelect',
  'ThemeProvider',
  'MobileMenuFooter',
  'MarkdownContent',
  'Search',
  'Sidebar',
  'MobileMenuToggle',
  'PageFrame',
];
// Absolute, forward slashes on every OS (no export key exists for it, §4.1).
const MIDDLEWARE = fileURLToPath(new URL('./route-middleware.mjs', import.meta.url)).replaceAll('\\', '/');
const FAVICON = fileURLToPath(new URL('./favicon.mjs', import.meta.url)).replaceAll('\\', '/');
// Plugin options the runtime (route middleware) reads, as a virtual module: a module id, not a
// global, so the dev server, the build and Container tests (via getViteConfig) all resolve it.
const OPTIONS_ID = 'virtual:ocx-theme/options';

/**
 * @typedef {{ label: string, href: string }} Crumb
 * @typedef {{
 *   breadcrumbs?: false | { root?: Crumb | false },
 * }} OcxThemeOptions
 */

/**
 * Starlight plugin: OCX tokens, base styles, overrides, code theme, search merge.
 * `breadcrumbs`: the trail above every page title (default on, no root crumb: section first);
 * `false` drops it, `{ root: { label, href } }` adds a root crumb.
 * @param {OcxThemeOptions} [options]
 * @returns {import('@astrojs/starlight/types').StarlightPlugin}
 */
export default function ocxTheme({ breadcrumbs = {} } = {}) {
  // Defaults live in the route middleware, which reads this.
  const runtime = { breadcrumbs };
  return {
    name: '@ocx-sh/theme',
    hooks: {
      'config:setup'({ config, astroConfig, updateConfig, addIntegration, addRouteMiddleware, logger }) {
        const own = astroConfig.base.endsWith('/') ? astroConfig.base : `${astroConfig.base}/`;
        const claims = nav.claims.map((c) => c.path);
        if (!claims.includes(own))
          throw new Error(`@ocx-sh/theme: base "${own}" is not a claim path; claims: ${claims.join(', ')}`);
        const site = astroConfig.site?.replace(/\/$/, '');
        if (site && site !== SITE) throw new Error(`@ocx-sh/theme: site "${astroConfig.site}" is not ${SITE}`);
        // Starlight reads trailingSlash before plugin-added integrations run, so it is checked, not set.
        if (astroConfig.trailingSlash !== 'always')
          throw new Error(`@ocx-sh/theme: trailingSlash must be 'always', got '${astroConfig.trailingSlash}'`);

        addIntegration({
          name: '@ocx-sh/theme/site',
          hooks: {
            'astro:config:setup'({ config: astro, updateConfig, injectRoute }) {
              // Starlight's default favicon is `/favicon.svg`; the logo fills it unless the consumer has one.
              if (config.favicon === undefined && !existsSync(new URL('favicon.svg', astro.publicDir)))
                injectRoute({ pattern: '/favicon.svg', entrypoint: FAVICON, prerender: true });
              updateConfig({
                site: SITE,
                // Per-component stylesheets (ui primitives, explorer) inline instead of each
                // costing a render-blocking request, which Lighthouse charges as an extra round trip
                // before LCP. The shared Starlight bundle stays external and cached. Other assets keep
                // Vite's default; a consumer's own limit wins.
                vite: {
                  plugins: [
                    {
                      name: '@ocx-sh/theme/options',
                      /** @param {string} id */
                      resolveId: (id) => (id === OPTIONS_ID ? `\0${OPTIONS_ID}` : undefined),
                      /** @param {string} id */
                      load: (id) =>
                        id === `\0${OPTIONS_ID}` ? `export default ${JSON.stringify(runtime)};` : undefined,
                    },
                  ],
                  // Astro deep-merges this, so a consumer's own include list is kept (arrays concat).
                  optimizeDeps: { include: ZAG_DEPS },
                  ...(astro.vite?.build?.assetsInlineLimit === undefined && {
                    build: {
                      /** @type {(file: string, content: Buffer) => boolean | undefined} */
                      assetsInlineLimit: (file, content) =>
                        file.endsWith('.css') ? gzipSync(content).length < INLINE_CSS_MAX : undefined,
                    },
                  }),
                  // The modules every docs page fetches after its entry scripts share one chunk: as
                  // three, each was one more request before first paint, and Lighthouse's simulation
                  // (six HTTP/1.1 connections, four held by the preloaded fonts) queued LCP a round
                  // trip later on pages with a few component scripts. A consumer's own splitting wins.
                  ...(ownSplitting(astro.vite) && {
                    environments: {
                      client: { build: { rolldownOptions: { output: { codeSplitting: { groups: [EVERY_PAGE] } } } } },
                    },
                  }),
                },
                // cssVariable = the theme token: the inline Fonts API `:root` rule is unlayered, so it
                // wins over tokens.css and points the token at Astro's hashed family name.
                // Fallbacks lead with base.css's metric faces: Astro's own only try local("Arial") /
                // local("Courier New"), absent on Linux, so the swap would shift layout there.
                fonts: [
                  {
                    provider: italicOptional(fontProviders.fontsource()),
                    name: 'IBM Plex Sans',
                    cssVariable: '--ocx-font-sans',
                    weights: [400, 600],
                    fallbacks: ['OCX Sans Fallback', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
                    optimizedFallbacks: false,
                  },
                  {
                    provider: italicOptional(fontProviders.fontsource()),
                    name: 'IBM Plex Mono',
                    cssVariable: '--ocx-font-mono',
                    weights: [400, 600],
                    fallbacks: [
                      'OCX Mono Fallback',
                      'ui-monospace',
                      'SFMono-Regular',
                      'Menlo',
                      'Consolas',
                      'monospace',
                    ],
                    optimizedFallbacks: false,
                  },
                ],
              });
            },
          },
        });
        addRouteMiddleware({ entrypoint: MIDDLEWARE });
        if (config.components?.Search) logger.warn(SEARCH_WARNING);

        const ec = config.expressiveCode;
        const pagefind = config.pagefind;
        /** @type {{ bundlePath: string }[]} */
        const merged = mergeTargets(nav, own).map((t) => ({
          bundlePath: `${t.path}pagefind/`,
          mergeFilter: { section: t.label },
          indexWeight: INDEX_WEIGHT,
        }));
        for (const entry of (typeof pagefind === 'object' && pagefind.mergeIndex) || []) {
          if (!merged.some((m) => m.bundlePath === entry.bundlePath)) merged.push(entry);
        }
        updateConfig({
          // Theme first, so a consumer's own customCss still wins.
          customCss: [
            '@ocx-sh/theme/tokens.css',
            '@ocx-sh/theme/base.css',
            '@ocx-sh/theme/starlight.css',
            ...(config.customCss ?? []),
          ],
          components: {
            ...Object.fromEntries(OVERRIDES.map((n) => [n, `@ocx-sh/theme/starlight/${n}.astro`])),
            ...config.components,
          },
          expressiveCode: ec === false ? false : mergeEc(ec === true || ec === undefined ? {} : ec),
          pagefind: pagefind === false ? false : { ...(pagefind === true ? {} : pagefind), mergeIndex: merged },
        });
      },
    },
  };
}

/** @typedef {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} EcOptions */

/**
 * Consumer Expressive Code options over the theme's; `styleOverrides` and its `frames`
 * merge one level deep so a consumer tweak keeps the rest of the theme's code frame.
 * @param {EcOptions} ec
 * @returns {EcOptions}
 */
function mergeEc(ec) {
  const base = EXPRESSIVE_CODE.styleOverrides ?? {};
  const own = ec.styleOverrides ?? {};
  /** @type {(s: EcOptions['shiki']) => Extract<EcOptions['shiki'], object>} */
  const obj = (s) => (typeof s === 'object' ? s : {});
  const [baseShiki, ownShiki] = [obj(EXPRESSIVE_CODE.shiki), obj(ec.shiki)];
  return {
    ...EXPRESSIVE_CODE,
    ...ec,
    styleOverrides: { ...base, ...own, frames: { ...base.frames, ...own.frames } },
    // Consumer grammars add to the theme's (Elvish, pwsh parameters), never drop them.
    shiki: { ...baseShiki, ...ownShiki, langs: [...(baseShiki.langs ?? []), ...(ownShiki.langs ?? [])] },
  };
}
