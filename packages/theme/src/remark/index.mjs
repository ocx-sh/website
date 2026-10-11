// The ocx docs remark plugins. Astro 7 runs remark only on the `unified` processor of
// `@astrojs/markdown-remark`, so a consumer passes these to `unified({ remarkPlugins })` itself:
// a Starlight plugin cannot add them without that package and would override the consumer's processor.
export { remarkHeadingIds } from './heading-ids.mjs';
export { remarkIncludes } from './includes.mjs';
export { remarkMdLinks } from './md-links.mjs';
