// slimTokens: fewer spans, the same text and colours.
import { describe, expect, it } from 'vitest';
import { slimTokens } from '../src/components/shell-session.mjs';

const line = (inner: string) => `<div class="code">${inner}</div>`;
const A = 'style="--0:var(--a)"';
const B = 'style="--0:var(--b)"';

describe('slimTokens', () => {
  it('merges adjacent spans of one style', () => {
    expect(slimTokens(line(`<span ${A}>oc</span><span ${A}>x</span>`))).toBe(line(`<span ${A}>ocx</span>`));
  });

  it('drops the wrapper of a whitespace run between different styles', () => {
    expect(slimTokens(line(`<span ${A}>ocx</span><span ${B}> </span><span ${B}>add</span>`))).toBe(
      line(`<span ${A}>ocx</span> <span ${B}>add</span>`),
    );
    expect(slimTokens(line(`<span ${A}>a</span><span ${B}> </span><span style="--0:var(--c)">b</span>`))).toBe(
      line(`<span ${A}>a</span> <span style="--0:var(--c)">b</span>`),
    );
  });

  it('joins tokens of one style across the whitespace between them', () => {
    expect(slimTokens(line(`<span ${A}>--a</span><span ${B}> </span><span ${A}>--b</span>`))).toBe(
      line(`<span ${A}>--a --b</span>`),
    );
  });

  it('leaves a line with other markup, and everything outside a code line, alone', () => {
    const odd = line(`<span ${A}>a</span><em>b</em><span ${A}>c</span>`);
    expect(slimTokens(odd)).toBe(odd);
    const trailing = line(`<span ${A}>a</span><span ${A}>b</span><br>`);
    expect(slimTokens(trailing)).toBe(trailing);
    expect(slimTokens('<p><span a>x</span><span a>y</span></p>')).toBe('<p><span a>x</span><span a>y</span></p>');
  });

  it('keeps the text', () => {
    const text = (h: string) => h.replace(/<[^>]*>/g, '');
    const html = line(`<span ${A}>a&amp;</span><span ${B}>  </span><span ${A}>b</span><span ${B}> </span>`);
    expect(text(slimTokens(html))).toBe(text(html));
  });
});
