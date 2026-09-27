import type navJson from './nav.json';

export type Nav = typeof navJson;

/**
 * The header section a path belongs to: a top-level section id, or the
 * `activeAlias` target of the hub a sub-site mounts under ("ecosystem").
 */
export function activeSection(nav: Nav, pathname: string): string {
  const aliases: Record<string, string> = nav.activeAlias;
  const hub = (id: string): string => aliases[id] ?? id;
  const section = nav.sections.find((s) => 'href' in s && pathname.startsWith(s.href));
  if (section) return section.id;
  const action = nav.actions.find((a) => a.href.startsWith('/') && pathname.startsWith(a.href));
  if (action) return action.id;
  const subsite = nav.subsites.find((s) => pathname.startsWith(s.href));
  if (subsite) return hub(subsite.hub);
  const top = /^\/([^/]+)\//.exec(pathname)?.[1];
  return top && top in aliases ? hub(top) : '';
}
