// Component inventory (C-108b): read by showcase-coverage.test.ts, and by later gates
// (showcase shape, consumer fixture) that need the same exempt / override lists.

/**
 * Private sub-components rendered only through a parent, never imported directly by a page.
 * Each parent must itself be covered (imported by an mdx, or itself exempt / a Starlight override).
 * @type {Record<string, { parent: string; page: string }>}
 */
export const COMPONENT_EXEMPT = {
  // EcosystemMenu is the header's mega-menu panel: opened from SiteHeader.astro's popovertarget button,
  // present as page chrome on every page, not a standalone showcase demo.
  'EcosystemMenu.astro': { parent: 'SiteHeader.astro', page: 'page chrome on every page' },
  // The installer one-liner as a bare CommandBar, rendered by InstallCommand and by the landing; shown on the
  // install-command page (its `bar-only` story).
  'InstallBar.astro': { parent: 'InstallCommand.astro', page: 'components/install-command' },
  // The one script of every scroll-driven component, rendered by each of them: a page with several makes one request.
  'ui/ScrollMount.astro': { parent: 'ScrollFade.astro', page: 'components/scroll-fade' },
  // The number stepper's script, rendered by Input only for a stepped number field, so a text or
  // search Input keeps ~400 B gz of inline script out of its page.
  'ui/NumberStepperScript.astro': { parent: 'ui/Input.astro', page: 'components/input' },
};

/**
 * Every .astro under src/starlight/, classified once so a new override fails until reasoned about.
 * @type {Record<string, string>}
 */
export const STARLIGHT_OVERRIDES = {
  'Footer.astro': 'page chrome on every page',
  'frag-sidebar.astro': 'injected fragment route (frag/sidebar/<key>): a bare document, no page chrome',
  'SidebarList.astro': 'plain list body of the injected frag/sidebar fragments, not a page component',
  'Head.astro': 'document head, not renderable content',
  'Header.astro': 'page chrome on every page (renders SiteHeader)',
  'MarkdownContent.astro': 'wraps every page body; not a demoable component on its own',
  'MobileMenuFooter.astro': 'page chrome inside the mobile nav on every page',
  'MobileMenuToggle.astro': 'page chrome: the mobile menu button on every page with a sidebar',
  'PageFrame.astro': 'page layout frame (header, sidebar pane, main) on every page',
  'PageTitle.astro': 'page chrome on every page',
  'Search.astro': 'page chrome: the header search on every page',
  'Sidebar.astro': 'page chrome: the sidebar navigation on every page with a sidebar',
  'MobileTableOfContents.astro': 'page chrome on every page with headings, on a phone',
  'TableOfContents.astro': 'page chrome on every page with headings',
  'ThemeProvider.astro': 'inline pre-paint theme script, no markup',
  'ThemeSelect.astro': 'page chrome on every page',
};
