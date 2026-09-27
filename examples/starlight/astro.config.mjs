// Fixture site for @ocx-sh/theme: mounted under a non-root base like every
// section on ocx.sh, fed with committed component pages plus real pages that
// `task samples` pulls from consumer repos (gitignored).
import starlight from '@astrojs/starlight';
import ocxTheme from '@ocx-sh/theme/starlight';
import { defineConfig } from 'astro/config';

const samples = ['ocx', 'rules_ocx', 'python-sdk', 'catalog'];

export default defineConfig({
  base: '/docs/',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'ocx theme example',
      plugins: [ocxTheme()],
      sidebar: [
        { label: 'Components', items: [{ autogenerate: { directory: 'components' } }] },
        ...samples.map((name) => ({
          label: `sample: ${name}`,
          collapsed: true,
          items: [{ autogenerate: { directory: `samples/${name}` } }],
        })),
      ],
    }),
  ],
});
