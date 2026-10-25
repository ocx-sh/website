// scripts/shell-drift.mjs: the drift alarm for the shared header.
import { describe, expect, it } from 'vitest';
import { MARKER, check, parseRev, renderIssue, staleOf, sync } from './shell-drift.mjs';

const LIVE = 'aaaaaaaaaaaa';
const OLD = 'bbbbbbbbbbbb';
const html = (body: string, type = 'text/html; charset=utf-8') =>
  new Response(body, { status: 200, headers: { 'content-type': type } });
const claims = [
  { path: '/', repo: 'ocx-sh/website' },
  { path: '/docs/', repo: 'ocx-sh/ocx' },
  { path: '/install/', repo: 'ocx-sh/www-setup' },
  { path: '/schemas/', repo: 'ocx-sh/ocx' },
  { path: '/gone/', repo: 'ocx-sh/gone' },
];
const pages: Record<string, () => Response> = {
  '/_shell/v1/current.json': () => Response.json({ v: 1, rev: LIVE }),
  '/': () => html(`<header data-nav-rev="${LIVE}"></header>`),
  '/docs/': () => html(`<header class="x" data-nav-rev="${OLD}"></header>`),
  '/install/': () => html('<header></header>'),
  '/schemas/': () => html('{}', 'application/json'),
  '/gone/': () => new Response('no', { status: 404 }),
};
const get = ((url: string) => {
  const make = pages[new URL(url).pathname];
  if (!make) throw new Error(`unexpected ${url}`);
  return Promise.resolve(make());
}) as unknown as typeof fetch;

describe('parseRev', () => {
  it('reads the attribute wherever it sits, and null when absent', () => {
    expect(parseRev(`<header id="h" data-nav-rev="${LIVE}" class="y">`)).toBe(LIVE);
    expect(parseRev('<header></header>')).toBeNull();
  });
});

describe('check', () => {
  it('classifies each claim: ok, stale, missing, unchecked', async () => {
    const report = await check(claims, get);
    expect(report.current).toBe(LIVE);
    expect(report.rows.map((r) => [r.path, r.state, r.rev ?? r.note])).toEqual([
      ['/', 'ok', LIVE],
      ['/docs/', 'stale', OLD],
      ['/install/', 'missing', undefined],
      ['/schemas/', 'unchecked', 'not an HTML page'],
      ['/gone/', 'unchecked', 'HTTP 404'],
    ]);
    expect(staleOf(report).map((r) => r.path)).toEqual(['/docs/', '/install/']);
  });

  it('retries a dropped request once, then reports the page unchecked', async () => {
    let calls = 0;
    const flaky = ((url: string) => {
      if (new URL(url).pathname === '/docs/' && calls++ === 0) throw new Error('reset');
      return get(url);
    }) as unknown as typeof fetch;
    expect((await check([{ path: '/docs/', repo: 'r' }], flaky)).rows[0]?.state).toBe('stale');
    const down = ((url: string) => {
      if (new URL(url).pathname === '/docs/') return Promise.reject(new Error('reset'));
      return get(url);
    }) as unknown as typeof fetch;
    expect((await check([{ path: '/docs/', repo: 'r' }], down)).rows[0]).toMatchObject({
      state: 'unchecked',
      note: 'reset',
    });
  });

  it('throws when current.json is not the contract', async () => {
    for (const bad of [
      () => new Response('x', { status: 404 }),
      () => Response.json({ v: 2, rev: LIVE }),
      () => Response.json({ v: 1, rev: 'ABC' }),
    ]) {
      const g = (() => Promise.resolve(bad())) as unknown as typeof fetch;
      await expect(check(claims, g)).rejects.toThrow(/current\.json/);
    }
  });
});

describe('renderIssue', () => {
  it('lists the stale sites and the unchecked ones, with the marker, and is deterministic', async () => {
    const report = await check(claims, get);
    const { body } = renderIssue(report);
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain(`| \`/docs/\` | ocx-sh/ocx | \`${OLD}\` |`);
    expect(body).toContain('| `/install/` | ocx-sh/www-setup | none (before theme 0.3.0) |');
    expect(body).toContain('- `/gone/` (ocx-sh/gone): HTTP 404');
    expect(body).not.toContain('| `/` |');
    expect(renderIssue(report).body).toBe(body);
  });
});

describe('sync', () => {
  type Call = [string, string, unknown];
  const fake = (open: unknown[]) => {
    const calls: Call[] = [];
    const api = (method: string, path: string, body?: unknown) => {
      calls.push([method, path, body]);
      return Promise.resolve(method === 'GET' ? open : { number: 7 });
    };
    return { api, calls };
  };
  const drift = () => check(claims, get);
  const sound = () => check([{ path: '/', repo: 'ocx-sh/website' }], get);

  it('opens one issue when none exists, ignoring unrelated issues and pull requests', async () => {
    const { api, calls } = fake([
      { number: 1, title: 'other', body: 'x' },
      { number: 2, title: 'pr', body: MARKER, pull_request: {} },
    ]);
    expect(await sync(await drift(), api)).toBe('opened #7');
    expect(calls.map(([m, p]) => `${m} ${p}`)).toEqual(['GET /issues?state=open&per_page=100', 'POST /issues']);
  });

  it('updates the existing issue instead of duplicating it, and leaves a current one alone', async () => {
    const report = await drift();
    const { title, body } = renderIssue(report);
    const stale = fake([{ number: 5, title, body: `${MARKER}\nold` }]);
    expect(await sync(report, stale.api)).toBe('updated #5');
    expect(stale.calls.map(([m, p]) => `${m} ${p}`)).toEqual([
      'GET /issues?state=open&per_page=100',
      'PATCH /issues/5',
    ]);
    const same = fake([{ number: 5, title, body }]);
    expect(await sync(report, same.api)).toBe('#5 already current');
    expect(same.calls).toHaveLength(1);
  });

  it('closes the issue once every site matches, and does nothing when there is none', async () => {
    const closing = fake([{ number: 5, title: 't', body: MARKER }]);
    expect(await sync(await sound(), closing.api)).toBe('in sync, closed #5');
    expect(closing.calls.map(([m, p]) => `${m} ${p}`)).toEqual([
      'GET /issues?state=open&per_page=100',
      'POST /issues/5/comments',
      'PATCH /issues/5',
    ]);
    const none = fake([]);
    expect(await sync(await sound(), none.api)).toBe('in sync, no issue open');
    expect(none.calls).toHaveLength(1);
  });

  it('opens no issue when the only problem is an unchecked page', async () => {
    const report = await check([{ path: '/gone/', repo: 'r' }], get);
    const { api, calls } = fake([]);
    expect(await sync(report, api)).toBe('in sync, no issue open');
    expect(calls).toHaveLength(1);
  });
});
