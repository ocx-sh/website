// Contract: the EC diff gutter (starlight.css › "ec diff markers") renders a
// fixed-width, centred +/- column with a real gap before the code, and the
// minus is U+2212 (matches the '+' bar width in the mono font), not a hyphen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/starlight/starlight.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

describe('ec diff markers', () => {
  it('renders the minus as U+2212, not a hyphen', () => {
    const body = rule('.expressive-code');
    expect(body).toMatch(/--ec-tm-delDiffIndContent:\s*'\\2212'/);
  });

  it('gives the marker a fixed, centred column', () => {
    const before = rule('.ec-line.ins .code::before,\n.ec-line.del .code::before');
    expect(before).toContain('inline-size: var(--ocx-ec-diff-marker-wd)');
    expect(before).toContain('display: flex');
    expect(before).toContain('align-items: center');
    expect(before).toContain('justify-content: center');
    expect(before).toContain('inset-block: 0'); // stretches to the line height, so centering is vertical too
  });

  // Owner 2026-09-29: the old space-5 + marker + space-3 indent was far too much.
  it('reserves an inset, the marker width and a small gap in the code padding, only on diff blocks', () => {
    const code = rule('.expressive-code:has(.ec-line.ins) .code,\n.expressive-code:has(.ec-line.del) .code');
    expect(code).toMatch(
      /--ec-codePadInl:\s*calc\(var\(--ocx-space-2\)\s*\+\s*var\(--ocx-ec-diff-marker-wd\)\s*\+\s*var\(--ocx-space-2\)\)/,
    );
    expect(rule('.ec-line.ins .code::before,\n.ec-line.del .code::before')).toMatch(
      /inset-inline-start:\s*var\(--ocx-space-2\)/,
    );
  });
});
