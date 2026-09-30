// One Starlight site per consumer repo, selected by PREVIEW_SITE (scripts/previews/build.ts sets it and builds
// from the generated project `.tmp/previews/<site>/`). Each is the real docs tree wearing @ocx-sh/theme at base
// `/`, so `https://<site>.preview.ocx.sh` looks like the site will once it deploys under its claim path.
// Not part of `task build`: the content is the consumers', so no budget or Lighthouse gate covers it.
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import { defineConfig } from 'astro/config';
import { findSite } from '../../scripts/previews/sites.mjs';

const site = findSite(process.env['PREVIEW_SITE'] ?? '');
// The header's section links point at the production claim paths, which the preview does not host: the site's
// own mount lands on its start page instead.
const start = site.home ?? '/';

export default defineConfig({
  base: '/',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  redirects: { [site.mount]: start, ...(site.home && { '/': site.home }) },
  integrations: [
    starlight({
      title: site.title,
      plugins: [ocxTheme()],
      // A preview is a review copy of someone else's content, never a second canonical page.
      head: [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }],
    }),
  ],
});
