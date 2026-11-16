// <ShellSession>: command and output fences marked in place, rendered over real Expressive Code
// output (the engine Starlight runs, serialised the way rehype does).
import { readFileSync } from 'node:fs';
import { ExpressiveCode, ExpressiveCodeTheme } from '@astrojs/starlight/expressive-code';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import { slimTokens } from '../src/components/shell-session.mjs';
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
const fence = async (code: string, language: string, meta = '') =>
  toHtml((await ec.render({ code, language, meta })).renderedGroupAst as Hast);

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
  it('marks a line after a trailing backslash as a continuation, in commands only', async () => {
    const cmd = await fence('ocx --offline package exec \\\n  ocx.sh/nodejs/node:24 -- node --version\nocx lock', 'sh');
    const out = await render([cmd, await fence('a \\\nb', 'text')].join('\n'));
    const lines = [...out.matchAll(/<div( data-ocx-continued)? class="ec-line/g)].map((m) => Boolean(m[1]));
    expect(lines).toEqual([false, true, false, false, false]);
  });

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

  it('changes only the opening tags (and slims the tokens): data-code, markup and the order of the blocks survive', async () => {
    // `>`, `<` and quotes inside data-code are not markup.
    const command = await fence('echo "<div class=\\"expressive-code\\"> a > b"', 'sh');
    const slot = [command, await fence('{ "ok": true }', 'json')].join('\n');
    expect(command).toContain('data-code="echo');
    const out = await render(slot);
    expect(entries(out)).toHaveLength(2);
    const marked = (kind: string, label: string) =>
      `<div data-ocx-session="${kind}" role="group" aria-label="${label}" class="expressive-code">`;
    const slim = slimTokens(slot);
    expect(out).toContain(slim.replace(OPEN, marked('command', 'Command')).replace(OPEN, marked('output', 'Output')));
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

  it('slims the tokens: fewer bytes, the same text', async () => {
    const slot = await fence('ocx exec -- node --version', 'sh');
    const out = await render(slot);
    const text = (h: string) => h.replace(/<[^>]*>/g, '');
    expect(out.match(/<span style/g)?.length).toBeLessThan(slot.match(/<span style/g)?.length ?? 0);
    expect(text(out.split('</pre>')[0] ?? '')).toContain('ocx exec -- node --version');
  });

  it('`play` marks the root for the player; without it there is no marker', async () => {
    const slot = await fence('ocx lock', 'sh');
    expect(await render(slot, { play: true })).toContain(
      'class="ocx-shell-session not-content" role="group" aria-label="Shell session" data-ocx-play',
    );
    expect(await render(slot)).not.toContain('data-ocx-play');
  });

  it('draws no `$` on a blank line or a `#` comment line of a shell or PowerShell command; a continuation keeps its mark', async () => {
    const marks = async (code: string, language: string) => {
      const out = await render(await fence(code, language));
      return [...out.matchAll(/<div( data-ocx-continued)? class="ec-line/g)].map((m) => Boolean(m[1]));
    };
    const sh = '# install\nocx lock\n\n  # indented\nocx exec -- node \\\n  # still a continuation\n  --version';
    expect(await marks(sh, 'sh')).toEqual([true, false, true, true, false, true, false]);
    expect(await marks('# list\nGet-ChildItem', 'powershell')).toEqual([true, false]);
    expect(await marks('# not shell\nprint(1)', 'python')).toEqual([false, false]);
    // In the output block the `>` stays: only commands are marked.
    const out = await render([await fence('ocx lock', 'sh'), await fence('# a\nb', 'text')].join('\n'));
    expect([...out.matchAll(/data-ocx-continued/g)]).toHaveLength(0);
  });

  it('ships no script of its own: the play and fold scripts render only with their prop', () => {
    // The Container API renders no hoisted script, so the source is what is pinned: no <script> in the component,
    // and each script component sits behind its own prop. A session without `play` is not a page script.
    const src = readFileSync(new URL('../src/components/ShellSession.astro', import.meta.url), 'utf8');
    expect(src).not.toMatch(/<script/);
    expect(src).toContain('{play && <PlayScript />}');
    expect(src).toContain('{collapsed && <FoldScript />}');
    expect(readFileSync(new URL('../src/components/ShellSessionPlayScript.astro', import.meta.url), 'utf8')).toContain(
      'data-ocx-play',
    );
  });

  describe('`collapsed`', () => {
    const slot = async () =>
      [
        await fence('ocx lock', 'sh'),
        await fence('locked 3 tools', 'text'),
        await fence('ocx exec -- node --version', 'sh'),
        await fence('v24.9.0', 'text'),
      ].join('\n');
    /** The folds of a render: each Collapsible root with the entry kinds inside it. */
    const folds = (html: string) =>
      html
        .split('class="ocx-collapsible ocx-shell-session-fold"')
        .slice(1)
        .map((part) => [...part.split('</pre>')[0]!.matchAll(/data-ocx-session="(\w+)"/g)].map((m) => m[1]));

    it('is the default: no prop, no fold and no Collapsible in the markup', async () => {
      const html = await render(await slot());
      expect(html).not.toContain('ocx-shell-session-fold');
      expect(html).not.toContain('ocx-collapsible');
      expect(html).not.toContain('data-zag-root');
      expect(await render(await slot(), { collapsed: false })).toBe(html);
    });

    it('folds every output and no command, in order', async () => {
      const html = await render(await slot(), { collapsed: true });
      expect(folds(html)).toEqual([['output'], ['output']]);
      expect(entries(html).map(([kind]) => kind)).toEqual(['command', 'output', 'command', 'output']);
    });

    it('gives each toggle a real button named Output, closed, controlling its own content', async () => {
      const html = await render(await slot(), { collapsed: true });
      const buttons = [...html.matchAll(/<button\b[^>]*ocx-collapsible__trigger[^>]*>/g)].map((m) => m[0]);
      // The command's copy button is not a toggle: only the two folds are.
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button).toContain('type="button"');
        expect(button).toContain('aria-expanded="false"');
        const controls = /aria-controls="([^"]+)"/.exec(button)?.[1];
        expect(controls).toBeTruthy();
        expect(html).toMatch(new RegExp(`<div[^>]*\\bid="${controls}"[^>]*>`));
      }
      expect(html.match(/ocx-collapsible__label">\s*Output\s*</g)).toHaveLength(2);
      expect(html.match(/class="ocx-collapsible__content"/g)).toHaveLength(2);
    });

    it('a session with only commands has nothing to fold', async () => {
      expect(folds(await render(await fence('ocx lock', 'sh'), { collapsed: true }))).toEqual([]);
    });

    it('cannot be combined with `play`', async () => {
      await expect(render(await slot(), { collapsed: true, play: true })).rejects.toThrow(
        /`collapsed` and `play` cannot be combined/,
      );
    });
  });

  describe('marked lines', () => {
    /** The opening tag of every `.ec-line`, in order. */
    const lineTags = (html: string) =>
      [...html.matchAll(/<div (?:data-ocx-continued )?class="ec-line[^"]*"[^>]*>/g)].map((m) => m[0]);

    it('keeps the marker classes and the badge label on the line, with and without slimming', async () => {
      const slot = [
        await fence('ocx install cmake:3.31\nocx select cmake:3.31', 'sh', '{"1":1} {"2":2}'),
        await fence('resolved\ndownloaded\nselected\nremoved', 'text', '{2} ins={3} del={4}'),
      ].join('\n');
      const tags = lineTags(await render(slot));
      expect(tags).toHaveLength(6);
      expect(tags[0]).toMatch(/class="ec-line highlight mark tm-label"[^>]*--tmLabel:(?:'|&#x27;)1/);
      expect(tags[1]).toMatch(/class="ec-line highlight mark tm-label"[^>]*--tmLabel:(?:'|&#x27;)2/);
      expect(tags.slice(2).map((t) => /class="([^"]*)"/.exec(t)?.[1])).toEqual([
        'ec-line',
        'ec-line highlight mark',
        'ec-line highlight ins',
        'ec-line highlight del',
      ]);
      // slimTokens leaves the line elements alone: the same tags before and after.
      expect(lineTags(slimTokens(slot))).toEqual(tags);
    });

    it('a marked line after a trailing backslash is still a continuation, and the badge line is not one', async () => {
      const cmd = await fence('ocx package exec \\\n  cmake -- cmake --version\nocx lock', 'sh', '{"1":2} ins={3}');
      const tags = lineTags(await render(cmd));
      expect(tags.map((t) => t.startsWith('<div data-ocx-continued'))).toEqual([false, true, false]);
      expect(tags[1]).toContain('tm-label');
    });

    it('an unmarked session ships no marker class', async () => {
      const html = await render(await fence('ocx lock', 'sh'));
      expect(html).not.toMatch(/highlight|tm-label|--tmLabel/);
    });

    it('draws the prompt and the badge in the marker sheet, never as text in the line', async () => {
      const html = await render(await fence('ocx lock', 'sh', '{"1":1}'));
      const line = lineTags(html)[0] ?? '';
      expect(html.split(line)[1]?.split('</div></div>')[0]).not.toMatch(/\$ |<span[^>]*>1</);
      const sheet = (await import('node:fs')).readFileSync(
        new URL('../src/components/shell-session-markers.css', import.meta.url),
        'utf8',
      );
      expect(sheet).toContain('.ec-line.highlight .code::before');
      expect(sheet).toMatch(
        /\.ec-line\.tm-label \.code:not\(\[data-cur\]\)::after \{[^}]*content: var\(--tmLabel\) \/ ''/,
      );
    });
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
