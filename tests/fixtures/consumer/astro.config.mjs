// @ts-check
// C-032 pack-smoke fixture: a minimal consumer of the packed @ocx-sh/theme
// tarball, mounted under a non-root base like every real ocx.sh section.
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  base: '/docs/',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'pack-smoke fixture',
      plugins: [ocxTheme()],
    }),
  ],
});
