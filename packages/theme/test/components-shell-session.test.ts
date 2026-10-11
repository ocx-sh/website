// <ShellSession>: command and output fences marked in place, rendered over real Expressive Code
// output (the engine Starlight runs, serialised the way rehype does).
import { ExpressiveCode, ExpressiveCodeTheme } from '@astrojs/starlight/expressive-code';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXPRESSIVE_CODE } from '../src/starlight/ec.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in code-tabs.test.ts).
const ShellSession = ((await import(`../src/components/${'ShellSession'}.astro`)) as { default: Component }).default;

interface Hast {
  tagName?: string;
  properties?: Record<string, string | string[]>;
  value?: string;
  children?: Hast[];
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** hast → HTML: className → class, camelCase → kebab-case, `"` and `&` escaped in values. */
const toHtml = (n: Hast): string => {
  if (n.value !== undefined) return esc(n.value);
  const attrs = Object.entries(n.properties ?? {})
    .map(([k, v]) => {
      const name = k === 'className' ? 'class' : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      return ` ${name}="${[v].flat().join(' ').replace(/&/g, '&amp;').replace(/"/g, '&#x22;')}"`;
    })
    .join('');
  return `<${n.tagName}${attrs}>${(n.children ?? []).map(toHtml).join('')}</${n.tagName}>`;
};

const ec = new ExpressiveCode({
  themes: [
    new ExpressiveCodeTheme(EXPRESSIVE_CODE.themes?.[0] as ConstructorParameters<typeof ExpressiveCodeTheme>[0]),
  ],
  shiki: EXPRESSIVE_CODE.shiki,
});
const fence = async (code: string, language: string) =>
  toHtml((await ec.render({ code, language })).renderedGroupAst as Hast);

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = (slot: string, props: Record<string, unknown> = {}) =>
  container.renderToString(ShellSession, { props, slots: { default: slot } });
/** The `data-ocx-session` / aria-label pairs of the rendered entries, in order. */
const entries = (html: string) =>
  [...html.matchAll(/<div data-ocx-session="(\w+)" role="group" aria-label="(\w+)" class="expressive-code"/g)].map(
    (m) => [m[1], m[2]],
  );
const OPEN = '<div class="expressive-code">';

describe('ShellSession', () => {
  it('marks fences by position: odd are commands, even are outputs', async () => {
    const slot = [
      await fence('ocx lock', 'sh'),
      await fence('locked 3 tools', 'text'),
      await fence('ocx exec -- node --version', 'sh'),
    ].join('\n');
    expect(entries(await render(slot))).toEqual([
      ['command', 'Command'],
      ['output', 'Output'],
      ['command', 'Command'],
    ]);
  });

  it('changes only the opening tags: data-code, markup and the order of the blocks survive byte for byte', async () => {
    // `>`, `<` and quotes inside data-code are not markup.
    const command = await fence('echo "<div class=\\"expressive-code\\"> a > b"', 'sh');
    const slot = [command, await fence('{ "ok": true }', 'json')].join('\n');
    expect(command).toContain('data-code="echo');
    const out = await render(slot);
    expect(entries(out)).toHaveLength(2);
    const marked = (kind: string, label: string) =>
      `<div data-ocx-session="${kind}" role="group" aria-label="${label}" class="expressive-code">`;
    expect(out).toContain(slot.replace(OPEN, marked('command', 'Command')).replace(OPEN, marked('output', 'Output')));
  });

  it('takes a single fence, and a hoisted stylesheet link and module script beside the blocks', async () => {
    const slot = `<link rel="stylesheet" href="/_astro/ec.css">\n${await fence('ocx lock', 'sh')}\n<script type="module" src="/ec.js"></script>`;
    expect(entries(await render(slot))).toEqual([['command', 'Command']]);
  });

  it('wraps the session in a named group, with a title bar only when titled', async () => {
    const slot = await fence('ocx lock', 'sh');
    const titled = await render(slot, { title: 'Lock "it"' });
    expect(titled).toContain('class="ocx-shell-session not-content" role="group" aria-label="Lock &quot;it&quot;"');
    expect(titled).toContain('<div class="ocx-shell-session-header">Lock &quot;it&quot;</div>');
    const plain = await render(slot);
    expect(plain).toContain('aria-label="Shell session"');
    expect(plain).not.toContain('ocx-shell-session-header');
  });

  it.each([
    ['an empty slot', ''],
    ['whitespace only', ' \n '],
    ['a link and no fence', '<link rel="stylesheet" href="/ec.css">'],
  ])('throws at build for %s', async (_, slot) => {
    await expect(render(slot)).rejects.toThrow(/needs at least one code fence/);
  });

  it.each([
    ['a paragraph', '<p>note</p>'],
    ['loose text', 'note'],
    ['another div', '<div class="aside">note</div>'],
  ])('throws at build for %s beside the fences', async (_, extra) => {
    const slot = `${await fence('ocx lock', 'sh')}\n${extra}`;
    await expect(render(slot)).rejects.toThrow(/holds only code fences/);
  });
});
