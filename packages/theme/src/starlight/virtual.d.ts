// Plugin options, served by the theme's Vite plugin (index.mjs).
declare module 'virtual:ocx-theme/options' {
  const options: { breadcrumbs?: false | { root?: { label: string; href: string } | false } };
  export default options;
}
