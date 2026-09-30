// Probe pages get a nested sidebar: a flat top-level group holding collapsible groups (C-230, S-109).
// The example's own sidebar is one link (D-Z23), so without this no built page would carry the
// nested groups consumer sites have, and neither the gates (budgets, Lighthouse) nor the sidebar
// e2e would see them. Only `probe/` pages pay for it.
import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';

type Entry = StarlightRouteData['sidebar'][number];

export const onRequest = defineRouteMiddleware((context) => {
  const here = context.url.pathname;
  if (!here.startsWith('/docs/probe/')) return;
  const link = (label: string, href: string, badge?: { text: string; variant: 'note' }): Entry => ({
    type: 'link',
    label,
    href,
    isCurrent: href === here,
    badge,
    attrs: {},
  });
  const group = (label: string, entries: Entry[], collapsed = true): Entry => ({
    type: 'group',
    label,
    entries,
    collapsed,
    badge: undefined,
  });
  const { starlightRoute } = context.locals;
  starlightRoute.sidebar = [
    ...starlightRoute.sidebar,
    group(
      'Probes',
      [
        group('Fixtures', [
          link('Long guide', '/docs/probe/long/'),
          link('Cascade', '/docs/probe/cascade/', { text: 'css', variant: 'note' }),
        ]),
        group('Gallery', [link('Components', '/docs/components/'), group('Deep', [link('Index', '/docs/')])]),
      ],
      false,
    ),
  ];
});
