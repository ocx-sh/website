// @vitest-environment jsdom
// C-120: the components overview filter (showcase kit): word and alias matching, hide/show, status,
// empty groups; D-SB9: the gallery's sidebar groups and its on-screen-only thumbnails.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyFilter,
  installThumbs,
  matches,
  thumbRoute,
} from '../../../examples/starlight/src/components/showcase/component-filter.mjs';
import { groupPages } from '../../../examples/starlight/src/components/showcase/pages.mjs';

const li = (text: string) => Object.assign(document.createElement('li'), { textContent: text });

describe('matches', () => {
  it('matches case-insensitively on any part of the text', () => {
    expect(matches('Tags input A field that holds chips', 'TAG')).toBe(true);
    expect(matches('Button', 'tag')).toBe(false);
  });
  it('requires every word', () => {
    expect(matches('Tags input A field', 'field tag')).toBe(true);
    expect(matches('Tags input A field', 'field zzz')).toBe(false);
  });
  it('expands keyword aliases, also as a prefix', () => {
    expect(matches('Select A picker', 'dropdown')).toBe(true);
    expect(matches('Menu', 'dropd')).toBe(true);
    expect(matches('Button', 'dropdown')).toBe(false);
    expect(matches('Dialog', 'mo')).toBe(false);
  });
  it('an empty query matches everything', () => {
    expect(matches('Button', '  ')).toBe(true);
  });
});

describe('applyFilter', () => {
  const items = [li('Tag label'), li('Button click'), li('Tag group')];
  it('hides misses and reports the count', () => {
    expect(applyFilter(items, 'tag')).toBe('2 components');
    expect(items.map((i) => i.hidden)).toEqual([false, true, false]);
    expect(applyFilter(items, 'button')).toBe('1 component');
  });
  it('reports an empty state, and a cleared query shows all', () => {
    expect(applyFilter(items, 'zzz')).toBe('No component matches');
    expect(applyFilter(items, '')).toBe('3 components');
    expect(items.every((i) => !i.hidden)).toBe(true);
  });
});

describe('applyFilter groups', () => {
  it('hides a list whose cards all miss, and its heading, and shows both again', () => {
    document.body.innerHTML = `
      <h2>A</h2><ul><li>Tag label</li><li>Tag group</li></ul>
      <h2>B</h2><ul><li>Button click</li></ul>`;
    const items = [...document.querySelectorAll('li')] as HTMLElement[];
    const hidden = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].map((e) => e.hidden);
    applyFilter(items, 'tag');
    expect([hidden('h2'), hidden('ul')]).toEqual([
      [false, true],
      [false, true],
    ]);
    applyFilter(items, 'button');
    expect([hidden('h2'), hidden('ul')]).toEqual([
      [true, false],
      [true, false],
    ]);
    applyFilter(items, '');
    expect([hidden('h2'), hidden('ul')]).toEqual([
      [false, false],
      [false, false],
    ]);
  });
});

describe('installThumbs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates the inert iframe with its src only when the box intersects', () => {
    let fire: (entries: Partial<IntersectionObserverEntry>[]) => void = () => {};
    const observed: Element[] = [];
    const unobserve = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: Partial<IntersectionObserverEntry>[]) => void) {
          fire = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        unobserve = unobserve;
      },
    );
    document.body.innerHTML = `
      <ul class="showcase-index">
        <li><a href="/docs/components/tabs/"><span class="showcase-index__thumb" data-story>Tabs</span></a></li>
        <li><a href="/docs/components/asides/"><span class="showcase-index__thumb">Asides</span></a></li>
      </ul>`;
    installThumbs();
    const [box] = observed;
    expect(observed).toHaveLength(1);
    if (!(box instanceof HTMLElement)) throw new Error('no box observed');
    fire([{ isIntersecting: false, target: box }]);
    expect(document.querySelector('iframe')).toBeNull();

    fire([{ isIntersecting: true, target: box }]);
    const frame = box.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('/docs/stories/tabs/default/?thumb');
    expect(frame?.title).toBe('Tabs preview');
    expect(frame?.hasAttribute('inert')).toBe(true);
    expect(frame?.getAttribute('tabindex')).toBe('-1');
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
    expect(frame?.hasAttribute('data-ready')).toBe(false);
    expect(unobserve).toHaveBeenCalledWith(box);
    frame?.dispatchEvent(new Event('load'));
    expect(frame?.hasAttribute('data-ready')).toBe(true);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });
});

describe('thumbRoute', () => {
  it('maps a card link to its default story in thumbnail mode, nested slugs included', () => {
    expect(thumbRoute('/docs/components/tabs/')).toBe('/docs/stories/tabs/default/?thumb');
    expect(thumbRoute('/docs/components/iconography/icon/')).toBe('/docs/stories/iconography/icon/default/?thumb');
  });
});

describe('groupPages', () => {
  const page = (slug: string) => ({ id: `components/${slug}` });
  const href = (p: { id: string }) => `/docs/${p.id}/`;
  const link = (slug: string) => ({ type: 'link' as const, href: `/docs/components/${slug}/` });
  const sidebar = [
    { type: 'link' as const, href: '/docs/previews/' },
    {
      type: 'group' as const,
      label: 'Components',
      entries: [
        link(''),
        { type: 'group' as const, label: 'Forms', entries: [link('input'), link('select')] },
        { type: 'group' as const, label: 'Empty', entries: [link('gone')] },
        {
          type: 'group' as const,
          label: 'Iconography',
          entries: [{ type: 'group' as const, label: 'Deep', entries: [link('iconography/icon')] }],
        },
        link('typography'),
      ],
    },
  ];

  it('groups by the nested sidebar groups, drops empty ones, and puts the rest last', () => {
    const pages = ['iconography/icon', 'input', 'select', 'typography'].map(page);
    const got = groupPages(pages, sidebar, href);
    expect(got.map((g) => [g.label, g.pages.map((p) => p.id)])).toEqual([
      ['Forms', ['components/input', 'components/select']],
      ['Iconography', ['components/iconography/icon']],
      ['Other', ['components/typography']],
    ]);
  });

  it('with no sidebar every page lands in the final group', () => {
    expect(groupPages([page('input')], [], href)).toEqual([{ label: 'Other', pages: [page('input')] }]);
  });
});
