// Plugin options, served by the theme's Vite plugin (index.mjs).
declare module 'virtual:ocx-theme/options' {
  const options: { breadcrumbs?: false | { root?: { label: string; href: string } | false } };
  export default options;
}

// The configured sidebar with no current page, served by the theme's Vite plugin.
declare module 'virtual:ocx-theme/sidebar' {
  import type { StarlightRouteData } from '@astrojs/starlight/route-data';
  export function configSidebar(): StarlightRouteData['sidebar'];
}

// Starlight's internals by file, served by the theme's Vite plugin (index.mjs).
declare module 'virtual:ocx-theme/starlight/TableOfContents/starlight-toc.js' {
  export class StarlightTOC extends HTMLElement {
    set current(link: HTMLAnchorElement);
  }
}
declare module 'virtual:ocx-theme/starlight/TableOfContents/TableOfContentsList.astro' {
  const List: import('astro/types').AstroComponentFactory;
  export default List;
}
declare module 'virtual:ocx-theme/starlight/../user-components/Icon.astro' {
  const Icon: import('astro/types').AstroComponentFactory;
  export default Icon;
}
