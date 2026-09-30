// <ToggleButton> (C-267, D-P5): native <button aria-pressed>, SSR already final, no Zag, rest
// spread, iconOnly typed to require an accessible name, tokens-only styles in @layer ocx.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { probeErrorLines } from './astro-props.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const ToggleButton = ((await import(`../src/components/ui/${'ToggleButton'}.astro`)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown> = {}, label = 'linux') => {
  const html = await container.renderToString(ToggleButton, { props, slots: { default: label } });
  return new JSDOM(html).window.document.querySelector('button')!;
};

describe('ToggleButton SSR', () => {
  it('is a type=button carrying the class, aria-pressed=false and size m by default', async () => {
    const b = await render();
    expect(b.getAttribute('type')).toBe('button');
    expect(b.classList.contains('ocx-ui-toggle-button')).toBe(true);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.getAttribute('data-size')).toBe('m');
    expect(b.hasAttribute('data-icon-only')).toBe(false);
    expect(b.hasAttribute('data-value')).toBe(false);
    expect(b.textContent?.trim()).toBe('linux');
  });

  it('pressed renders aria-pressed=true; value, size and disabled land as attributes', async () => {
    const b = await render({ pressed: true, value: 'linux', size: 's', disabled: true });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.getAttribute('data-value')).toBe('linux');
    expect(b.getAttribute('data-size')).toBe('s');
    expect(b.disabled).toBe(true);
  });

  it('iconOnly sets data-icon-only and keeps its aria-label', async () => {
    const b = await render({ iconOnly: true, 'aria-label': 'Bold' }, '');
    expect(b.hasAttribute('data-icon-only')).toBe(true);
    expect(b.getAttribute('aria-label')).toBe('Bold');
  });

  it('spreads rest attributes and merges class, but type and aria-pressed stay ours', async () => {
    const b = await render({ id: 'x', class: 'extra', 'data-test': '1', type: 'submit', 'aria-pressed': 'true' });
    expect(b.id).toBe('x');
    expect(b.getAttribute('data-test')).toBe('1');
    expect(b.classList.contains('extra')).toBe(true);
    expect(b.classList.contains('ocx-ui-toggle-button')).toBe(true);
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-pressed')).toBe('false');
  });

  it('is native: no Zag root, no machine hooks', async () => {
    const b = await render();
    expect(b.hasAttribute('data-zag-root')).toBe(false);
    expect(b.hasAttribute('data-scope')).toBe(false);
  });
});

describe('ToggleButton types', () => {
  it('iconOnly requires aria-label', () => {
    const lines = probeErrorLines(
      new URL('../src/components/ui/ToggleButton.astro', import.meta.url),
      [
        "const a: Props = { iconOnly: true, 'aria-label': 'Bold' };",
        'const b: Props = { iconOnly: false };',
        'const c: Props = { iconOnly: true };',
        'void [a, b, c];',
      ].join('\n'),
    );
    expect(lines).toEqual([2]); // c only, 0-based probe line
  });
});

describe('toggle-button.css', () => {
  const css = readFileSync(new URL('../src/components/ui/toggle-button.css', import.meta.url), 'utf8');
  it('sits in @layer ocx, tokens only, and keys pressed on aria-pressed and data-state', () => {
    expect(
      css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim()
        .startsWith('@layer ocx {'),
    ).toBe(true);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/i);
    expect(css).toContain("[aria-pressed='true'], [data-state='on']");
    expect(css).toContain('.ocx-ui-toggle-button[data-icon-only]');
    expect(css).toMatch(/forced-colors: active[\s\S]*Highlight;/); // pressed survives forced colours
    expect(css).not.toContain('!important');
  });
});
