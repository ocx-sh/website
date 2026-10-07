// Fixture site for @ocx-sh/theme: mounted under a non-root base like every
// section on ocx.sh, fed with committed component pages. Real consumer docs
// are separate sites (examples/previews, `task previews`).
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  // A claim path; the plugin sets `site`.
  base: '/docs/',
  // Starlight reads it before plugins run, so the theme checks it rather than sets it.
  trailingSlash: 'always',
  // The dev toolbar is Astro's, not the theme's: keep it out of the owner's review view.
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'ocx theme example',
      plugins: [ocxTheme()],
      // Showcase kit styles ride in the shared stylesheet (see showcase.css).
      customCss: ['./src/components/showcase/showcase.css'],
      // Probe pages carry a nested sidebar (collapsible groups), see the file.
      routeMiddleware: './src/probe-sidebar.ts',
      sidebar: [
        { label: 'Live previews', link: '/previews/' },
        // Every component page listed, grouped and collapsed (C-120): flat items cost ~60 B gzip
        // per page each, so this is a budget trade the owner asked for explicitly. Explicit items,
        // not `autogenerate`: most pages live flat under components/. Every page must appear here
        // (showcase-shape test).
        {
          label: 'Components',
          items: [
            { label: 'Overview', link: '/components/' },
            {
              label: 'Actions',
              collapsed: true,
              items: [
                { label: 'Button', link: '/components/button/' },
                { label: 'Command bar', link: '/components/command-bar/' },
                { label: 'Copy button', link: '/components/copy-button/' },
                { label: 'Link', link: '/components/link/' },
              ],
            },
            {
              label: 'Forms',
              collapsed: true,
              items: [
                { label: 'Choice', link: '/components/choice/' },
                { label: 'Combobox', link: '/components/combobox/' },
                { label: 'Cycle button', link: '/components/cycle-button/' },
                { label: 'Input', link: '/components/input/' },
                { label: 'Input group', link: '/components/input-group/' },
                { label: 'Label', link: '/components/label/' },
                { label: 'RadioGroup', link: '/components/radio-group/' },
                { label: 'Search field', link: '/components/search-field/' },
                { label: 'Select', link: '/components/select/' },
                { label: 'Slider', link: '/components/slider/' },
                { label: 'Tags input', link: '/components/tags-input/' },
                { label: 'Toggle button', link: '/components/toggle-button/' },
                { label: 'Toggle group', link: '/components/toggle-group/' },
              ],
            },
            {
              label: 'Overlays',
              collapsed: true,
              items: [
                { label: 'ActionMenu', link: '/components/action-menu/' },
                { label: 'Dialog', link: '/components/dialog/' },
                { label: 'Dialog presets', link: '/components/dialog-presets/' },
                { label: 'Drawer', link: '/components/drawer/' },
                { label: 'Hint', link: '/components/hint/' },
                { label: 'Menu', link: '/components/menu/' },
                { label: 'Popover', link: '/components/popover/' },
                { label: 'Tooltip', link: '/components/tooltip/' },
              ],
            },
            {
              label: 'Navigation',
              collapsed: true,
              items: [
                { label: 'Breadcrumbs', link: '/components/breadcrumbs/' },
                { label: 'Pagination', link: '/components/pagination/' },
                { label: 'Shell', link: '/components/shell/' },
                { label: 'Steps', link: '/components/steps/' },
                { label: 'Tabs', link: '/components/tabs/' },
                { label: 'Toc', link: '/components/toc/' },
              ],
            },
            {
              label: 'Data display',
              collapsed: true,
              items: [
                { label: 'Accordion', link: '/components/accordion/' },
                { label: 'Avatar', link: '/components/avatar/' },
                { label: 'Collapsible', link: '/components/collapsible/' },
                { label: 'DataTable', link: '/components/data-table/' },
                { label: 'Dependency explorer', link: '/components/dependency-explorer/' },
                { label: 'Keyboard', link: '/components/keyboard/' },
                { label: 'List', link: '/components/list/' },
                { label: 'Tables', link: '/components/tables/' },
                { label: 'Tag group', link: '/components/tag-group/' },
                { label: 'Tree', link: '/components/tree/' },
                { label: 'Tree view', link: '/components/tree-view/' },
              ],
            },
            {
              label: 'Feedback',
              collapsed: true,
              items: [
                { label: 'Asides', link: '/components/asides/' },
                { label: 'Badges', link: '/components/badges/' },
                { label: 'Loader', link: '/components/loader/' },
                { label: 'Meter', link: '/components/meter/' },
                { label: 'Progress circle', link: '/components/progress-circle/' },
                { label: 'Skeleton', link: '/components/skeleton/' },
                { label: 'Tag', link: '/components/tag/' },
                { label: 'Toast', link: '/components/toast/' },
              ],
            },
            {
              label: 'Content',
              collapsed: true,
              items: [
                { label: 'Cards', link: '/components/cards/' },
                { label: 'Code', link: '/components/code/' },
                { label: 'Code colours', link: '/components/code-colours/' },
                { label: 'Feature sections', link: '/components/feature-section/' },
                { label: 'Hub grid', link: '/components/hub-grid/' },
                { label: 'Prose', link: '/components/prose/' },
                { label: 'Terminal', link: '/components/terminal/' },
              ],
            },
            {
              label: 'Iconography',
              collapsed: true,
              items: [
                { label: 'Overview', link: '/components/iconography/' },
                { label: 'Icon', link: '/components/iconography/icon/' },
                { label: 'Logo', link: '/components/iconography/logo/' },
                { label: 'Catalog', link: '/components/iconography/catalog/' },
                { label: 'OS icons', link: '/components/iconography/os/' },
                { label: 'Platform icons', link: '/components/platform-icons/' },
              ],
            },
            { label: 'Typography', link: '/components/typography/' },
          ],
        },
      ],
    }),
  ],
});
