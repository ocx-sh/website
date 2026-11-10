// The key both sides of the sidebar deferral (Sidebar.astro, frag-sidebar.astro) use for a group.
import { describe, expect, it } from 'vitest';
import { deferrable, groupKey, hash32 } from '../src/starlight/sidebar-groups.mjs';

const link = (label: string, href: string) => ({
  type: 'link' as const,
  label,
  href,
  isCurrent: false,
  badge: undefined,
  attrs: {},
});
const group = (label: string, entries: ReturnType<typeof link>[], collapsed = true) =>
  ({ type: 'group' as const, label, entries, collapsed, badge: undefined }) as never;

describe('sidebar groups', () => {
  it('a key depends on labels and hrefs only, not on the current page', () => {
    const a = group('Forms', [link('Input', '/input/')]);
    const b = group('Forms', [{ ...link('Input', '/input/'), isCurrent: true }]);
    expect(groupKey(a)).toBe(groupKey(b));
    expect(groupKey(a)).not.toBe(groupKey(group('Forms', [link('Input', '/other/')])));
  });

  it('serves nested collapsed groups only, not top-level or open ones', () => {
    const forms = group('Forms', [link('Input', '/input/')]);
    const open = group('Open', [link('A', '/a/')], false);
    const served = deferrable([group('Top', [forms, open] as never, false)]);
    expect([...served.values()]).toEqual([forms]);
    expect(deferrable([forms]).size).toBe(0);
  });

  it('two different groups with one key are refused, naming both', () => {
    // 'Aa' and 'BB' hash alike (31*65+97 = 31*66+66), so label-only groups collide.
    const a = group('Aa', []);
    const b = group('BB', []);
    expect(groupKey(a)).toBe(groupKey(b));
    expect(() => deferrable([group('Top', [a, b] as never, false)])).toThrow(/"Aa" and "BB"/);
  });

  it('hash32 is the base-36 string hash', () => {
    expect(hash32('')).toBe('0');
    expect(hash32('a')).toBe((97).toString(36));
  });
});
