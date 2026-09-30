// C-268 Tag chip primitive: filter variant, as=button, removable, removeProps and rest spread (Container, node).
// Look and no-JS checks read ui/tag.css and the rendered markup; the label/stamp look stays in ui-status.test.ts.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import: tsc has no .astro module types (as in ui-status.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Tag = await load('Tag');
const css = readFileSync(new URL('../src/components/ui/tag.css', import.meta.url), 'utf8');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(props: Record<string, unknown>, slot = 'linux') {
  const html = await container.renderToString(Tag, { props, slots: { default: slot } });
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  return { html, doc, tag: doc.querySelector('.ocx-ui-tag')! };
}

describe('C-268 Tag filter variant', () => {
  it('renders data-variant=filter with the check icon always present, hidden by CSS until on', async () => {
    const { tag } = await render({ variant: 'filter', as: 'button', 'aria-pressed': 'false' });
    expect(tag.getAttribute('data-variant')).toBe('filter');
    const check = tag.querySelector('.ocx-ui-tag__check');
    expect(check?.getAttribute('data-icon')).toBe('check');
    expect(check?.getAttribute('aria-hidden')).toBe('true');
    expect(tag.textContent?.trim()).toBe('linux');
  });

  it('the on state is keyed on aria-pressed, aria-checked and data-state (not on a class)', () => {
    expect(css).toMatch(
      /\[data-variant='filter'\]:is\(\[aria-pressed='true'\], \[aria-checked='true'\], \[data-state='on'\]\)/,
    );
    expect(css).toMatch(/\.ocx-ui-tag__check\s*\{\s*display:\s*none/);
  });

  it('on = accent ink on accent tint with an emphasis edge drawn inside (box does not grow)', () => {
    const on = /\[data-state='on'\]\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(on).toContain('--_tone: var(--ocx-color-accent-fg)');
    expect(on).toContain('--_tint: var(--ocx-color-accent-tint)');
    expect(on).toMatch(/border-color:\s*var\(--ocx-color-accent\)/);
    expect(on).toMatch(/box-shadow:\s*inset[^;]*var\(--ocx-border-width-emphasis\)/);
  });

  it('off = surface, hairline, muted ink; hover fg; focus ring; disabled flat subtle', () => {
    const off = /\[data-variant='filter'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(off).toContain('--_tone: var(--ocx-color-fg-muted)');
    expect(off).toContain('--_tint: var(--ocx-color-surface)');
    expect(off).toMatch(/border-color:\s*var\(--ocx-color-border\)/);
    expect(off).toContain('cursor: pointer');
    expect(css).toMatch(/\[data-variant='filter'\]:hover\s*\{[^}]*--_tone:\s*var\(--ocx-color-fg\)/);
    expect(css).toMatch(/\[data-variant='filter'\]:focus-visible\s*\{[^}]*var\(--ocx-focus-ring\)/);
    expect(css).toMatch(/:is\(:disabled, \[aria-disabled='true'\]\)\s*\{[^}]*surface-subtle[^}]*box-shadow:\s*none/);
  });

  it('label and stamp render no check icon and no button', async () => {
    for (const variant of ['label', 'stamp']) {
      const { tag } = await render({ variant });
      expect(tag.querySelector('.ocx-ui-tag__check, button, svg')).toBeNull();
    }
  });
});

describe('C-268 Tag element and value', () => {
  it('defaults to a span without type; as=button gets type=button', async () => {
    const span = (await render({})).tag;
    expect(span.tagName).toBe('SPAN');
    expect(span.hasAttribute('type')).toBe(false);
    const button = (await render({ as: 'button' })).tag;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('value becomes data-value; rest attributes and class reach the root', async () => {
    const { tag } = await render({
      value: 'linux',
      class: 'extra',
      'data-x': '1',
      id: 't1',
      'aria-pressed': 'true',
      disabled: true,
      as: 'button',
    });
    expect(tag.getAttribute('data-value')).toBe('linux');
    expect(tag.classList.contains('extra')).toBe(true);
    expect(tag.getAttribute('data-x')).toBe('1');
    expect(tag.id).toBe('t1');
    expect(tag.getAttribute('aria-pressed')).toBe('true');
    expect(tag.hasAttribute('disabled')).toBe(true);
  });
});

describe('C-268 Tag removable', () => {
  it('renders a trailing button.ocx-ui-tag__remove named by removeLabel with the close icon', async () => {
    const { tag } = await render({ removable: true, removeLabel: 'Remove linux' });
    expect(tag.tagName).toBe('SPAN');
    expect(tag.hasAttribute('data-removable')).toBe(true);
    const b = tag.querySelector('button.ocx-ui-tag__remove');
    expect(b?.getAttribute('type')).toBe('button');
    expect(b?.getAttribute('aria-label')).toBe('Remove linux');
    expect(b?.querySelector('svg')?.getAttribute('data-icon')).toBe('close');
    expect(b?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(tag.lastElementChild).toBe(b);
  });

  it('removeProps spread on the remove button, not on the root', async () => {
    const { tag } = await render({
      removable: true,
      removeLabel: 'Remove',
      removeProps: { 'data-part': 'item-delete-trigger', tabindex: '-1' },
      'data-part': 'item',
    });
    const b = tag.querySelector('.ocx-ui-tag__remove');
    expect(b?.getAttribute('data-part')).toBe('item-delete-trigger');
    expect(b?.getAttribute('tabindex')).toBe('-1');
    expect(tag.getAttribute('data-part')).toBe('item');
  });

  it('removable combines with tone; a non-removable tag has no remove button', async () => {
    const { tag } = await render({ removable: true, removeLabel: 'Remove', tone: 'success' });
    expect(tag.getAttribute('data-tone')).toBe('success');
    expect((await render({})).tag.querySelector('.ocx-ui-tag__remove')).toBeNull();
  });

  it('the remove button is square, fg-subtle turning fg, focus ring, and Tag holds no behaviour', async () => {
    const b = /\.ocx-ui-tag__remove\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(b).toMatch(/inline-size:\s*var\(--ocx-icon-md\)/);
    expect(b).toMatch(/block-size:\s*var\(--ocx-icon-md\)/);
    expect(b).toContain('color: var(--ocx-color-fg-subtle)');
    expect(css).toMatch(/\.ocx-ui-tag__remove:hover\s*\{[^}]*var\(--ocx-color-fg\)/);
    expect(css).toMatch(/\.ocx-ui-tag__remove:focus-visible\s*\{[^}]*var\(--ocx-focus-ring\)/);
    expect((await render({ variant: 'filter', removable: true, removeLabel: 'x' })).html).not.toMatch(/<script/i);
  });
});

describe('C-268 Tag label and stamp stay unchanged', () => {
  it('markup is the old span apart from the new attributes: no icon, no button, tone and variant kept', async () => {
    const { tag, html } = await render({ variant: 'stamp', tone: 'danger' }, 'revoked');
    expect(tag.tagName).toBe('SPAN');
    expect(tag.getAttribute('data-variant')).toBe('stamp');
    expect(tag.getAttribute('data-tone')).toBe('danger');
    expect(tag.hasAttribute('data-value')).toBe(false);
    expect(tag.hasAttribute('data-removable')).toBe(false);
    expect(tag.textContent?.trim()).toBe('revoked');
    expect(html).not.toMatch(/<svg|<button/);
  });

  it('a label keeps display:inline-block; only filter and removable chips are flex', () => {
    expect(/\.ocx-ui-tag\s*\{([^}]*)\}/.exec(css)?.[1]).toContain('display: inline-block');
    expect(css).toMatch(/\[data-variant='filter'\],\s*\.ocx-ui-tag\[data-removable\]\s*\{[^}]*inline-flex/);
  });
});
