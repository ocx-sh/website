// Starlight resolves `virtual:starlight/components/*` to the configured override (or its default)
// but ships no types for them (0.42). Only the modules the theme imports are declared (C-107a).
declare module 'virtual:starlight/components/Search' {
  const Search: (props: Record<string, unknown>) => unknown;
  export default Search;
}
declare module 'virtual:starlight/components/MobileMenuFooter' {
  const MobileMenuFooter: (props: Record<string, unknown>) => unknown;
  export default MobileMenuFooter;
}

// Vite `?inline`: a stylesheet as a string, never emitted into the page's CSS (toast.zag.mjs).
declare module '*.css?inline' {
  const css: string;
  export default css;
}

// Starlight's Pagefind options (its `pagefind` config, incl. the `mergeIndex` list our plugin builds).
declare module 'virtual:starlight/pagefind-config' {
  export const pagefindUserConfig: Record<string, unknown>;
}

// Starlight's project facts; the search reads `trailingSlash` as Starlight's own Search does.
declare module 'virtual:starlight/project-context' {
  const project: { trailingSlash: 'always' | 'never' | 'ignore' };
  export default project;
}

// Starlight's resolved config; MobileMenuFooter reads whether the site has several locales.
declare module 'virtual:starlight/user-config' {
  const config: { isMultilingual: boolean };
  export default config;
}

// Pagefind's UI ships no types; only the constructor the search dialog calls is declared.
declare module '@pagefind/default-ui' {
  export class PagefindUI {
    constructor(options: Record<string, unknown>);
  }
}

// Vite's `import.meta.env`, as vite/client declares it (only what the theme reads).
interface ImportMetaEnv {
  BASE_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
