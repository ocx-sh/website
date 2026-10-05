// The origin-leak check, written from its contract.
import { describe, expect, it } from 'vitest';
import { findLeaks } from './leak.mjs';

const page = (head = '', body = '') =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;

describe('findLeaks', () => {
  it('a clean page has no findings', () => {
    const headers = { 'content-type': 'text/html', location: 'https://ocx.sh/docs/' };
    expect(findLeaks({ headers, body: page('<link rel="canonical" href="https://ocx.sh/docs/">') })).toEqual([]);
  });

  it.each([
    ['Location', 'https://ocx-website.pages.dev/docs/'],
    ['Link', '<https://ocx-sh.github.io/catalog/>; rel="canonical"'],
    ['Content-Location', 'https://x.pages.dev/a'],
    ['Set-Cookie', 'sid=1; Domain=ocx-website.pages.dev; Path=/'],
  ])('%s naming an origin host is a finding', (name, value) => {
    expect(findLeaks({ headers: { [name]: value }, body: page() }).length).toBeGreaterThan(0);
  });

  it('matches header names in any case and reads a multi-valued header', () => {
    const headers = { 'SET-COOKIE': ['a=1; Path=/', 'b=2; Domain=ocx-sh.github.io'] };
    expect(findLeaks({ headers, body: page() }).length).toBeGreaterThan(0);
  });

  it('the page canonical link or og:url naming an origin host is a finding', () => {
    const canonical = page('<link rel="canonical" href="https://ocx-sh.github.io/rules_ocx/">');
    const og = page('<meta property="og:url" content="https://x.pages.dev/">');
    expect(findLeaks({ headers: {}, body: canonical }).length).toBeGreaterThan(0);
    expect(findLeaks({ headers: {}, body: og }).length).toBeGreaterThan(0);
  });

  it('the literal ocx-website.pages.dev anywhere in the body is a finding', () => {
    expect(findLeaks({ headers: {}, body: page('', '<p>see ocx-website.pages.dev</p>') }).length).toBeGreaterThan(0);
  });

  it('a third-party github.io link in the body is not a finding', () => {
    const body = page('', '<a href="https://jqlang.github.io/jq/manual/">jq</a>');
    expect(findLeaks({ headers: {}, body })).toEqual([]);
  });

  it('reports where and what, and reads canonical and og:url in either attribute order', () => {
    const body = page(
      '<link href="https://x.pages.dev/c" rel="canonical"><meta content="https://ocx-sh.github.io/o" property="og:url">',
    );
    expect(findLeaks({ headers: { Location: 'https://x.pages.dev/a' }, body })).toEqual([
      { where: 'header:location', value: 'x.pages.dev' },
      { where: 'canonical', value: 'x.pages.dev' },
      { where: 'og:url', value: 'ocx-sh.github.io' },
    ]);
  });

  it('the literal ocx-website.pages.dev in the body is reported as body', () => {
    const findings = findLeaks({ headers: {}, body: page('', '<p>ocx-website.pages.dev</p>') });
    expect(findings).toEqual([{ where: 'body', value: 'ocx-website.pages.dev' }]);
  });

  it('matches the literal ocx-website.pages.dev in any case', () => {
    const findings = findLeaks({ headers: {}, body: page('', '<p>OCX-Website.Pages.Dev</p>') });
    expect(findings).toEqual([{ where: 'body', value: 'ocx-website.pages.dev' }]);
  });

  it('a lookalike host or a cookie that merely mentions an origin is not a finding', () => {
    const headers = { Location: 'https://notpages.dev.example/', 'Set-Cookie': 'ref=pages.dev; Domain=ocx.sh' };
    expect(findLeaks({ headers, body: page() })).toEqual([]);
  });

  it('a third-party pages.dev or github.io canonical-free page with other headers stays clean', () => {
    const headers = { Link: '<https://ocx.sh/a>; rel="next"', 'Content-Location': '/docs/' };
    expect(findLeaks({ headers, body: page('<link rel="stylesheet" href="https://jqlang.github.io/x.css">') })).toEqual(
      [],
    );
  });
});
