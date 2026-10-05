import { fileURLToPath } from 'node:url';
import { getViteConfig } from 'astro/config';
import { configDefaults } from 'vitest/config';

// Loads the example's Astro/Starlight config so Container API tests render real components.
export default getViteConfig(
  {
    test: {
      root: import.meta.dirname,
      include: [
        'packages/**/*.test.{ts,mjs}',
        'scripts/**/*.test.{ts,mjs}',
        'tests/*.test.{ts,mjs}',
        'infra/**/*.test.{ts,mjs}',
        'site/**/*.test.{ts,mjs}',
        '.github/actions/deploy/test/**/*.test.{ts,mjs}',
      ],
      // Builds `site/dist` once for the dist-reading tests (site/src/build-site.ts).
      globalSetup: ['site/src/global-setup.ts'],
      exclude: [...configDefaults.exclude, '**/.tmp/**', '**/.agents/worktrees/**'],
    },
  },
  { root: fileURLToPath(new URL('examples/starlight/', import.meta.url)) },
);
