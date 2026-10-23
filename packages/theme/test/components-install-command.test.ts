// <InstallCommand>: one shell-synced tab per installer, each panel one CommandBar holding the line typed in
// that shell, the short bar variant's shell picker, and the optional install-guide link.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const InstallCommand = ((await import(`../src/components/${'InstallCommand'}.astro`)) as { default: Component })
  .default;

// The ocx-sh/www-setup README's forms, each run from inside its own shell.
const SHELLS = [
  ['Shell', 'shell', 'curl -fsSL https://setup.ocx.sh/sh | sh'],
  ['PowerShell', 'powershell', 'irm https://setup.ocx.sh/pwsh | iex'],
  ['Nushell', 'nushell', 'nu -c (http get https://setup.ocx.sh/nu)'],
  ['fish', 'fish', 'curl -fsSL https://setup.ocx.sh/fish | fish'],
  ['Elvish', 'elvish', 'elvish -c (e:curl -fsSL https://setup.ocx.sh/elvish | slurp)'],
];

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown> = {}) =>
  new JSDOM(await container.renderToString(InstallCommand, { props })).window.document;

describe('InstallCommand SSR', () => {
  it('one tab per shell, in order, with its icon, in the `shell` sync group', async () => {
    const doc = await render();
    const tabs = doc.querySelector('.ocx-tabs')!;
    expect(tabs.getAttribute('data-sync-key')).toBe('shell');
    const triggers = [...tabs.querySelectorAll('[data-part="list"] > [data-part="trigger"]')];
    expect(triggers.map((t) => t.textContent?.trim())).toEqual(SHELLS.map(([label]) => label));
    expect(triggers.map((t) => t.querySelector('svg')?.getAttribute('data-icon'))).toEqual(
      SHELLS.map(([, icon]) => icon),
    );
  });

  it('each panel is one bar holding exactly its shell command, with no picker and no action', async () => {
    const doc = await render();
    const panels = [...doc.querySelectorAll('.ocx-tabs [data-part="content"]')];
    expect(panels).toHaveLength(SHELLS.length);
    for (const [i, panel] of panels.entries()) {
      const [label, , command] = SHELLS[i]!;
      const bars = panel.querySelectorAll('.ocx-cmdbar');
      expect(bars).toHaveLength(1);
      expect(panel.querySelector('.ocx-cmdbar__text')?.textContent?.trim()).toBe(command);
      expect(panel.querySelector('.ocx-cmdbar__copy')?.getAttribute('data-label')).toBe(`${label} install command`);
      expect(panel.querySelector('.ocx-cmdbar__picker')).toBeNull();
      expect(panel.querySelector('.ocx-cmdbar__action')).toBeNull();
    }
  });

  it("every line is highlighted in its shell's grammar, in both variants", async () => {
    for (const doc of [await render(), await render({ variant: 'bar' })]) {
      const data = [...doc.querySelectorAll<HTMLElement>('.ocx-cmdbar')].flatMap(
        (bar) => JSON.parse(bar.dataset['choices']!) as { html?: string }[],
      );
      expect(data).toHaveLength(SHELLS.length);
      expect(data.every((c) => c.html?.includes('color:var(--ocx-color-code-'))).toBe(true);
    }
  });

  it('docs: one install-guide link at the end of the tab row, outside the tablist', async () => {
    const doc = await render({ docs: true });
    const links = [...doc.querySelectorAll('.ocx-tabs a')];
    expect(links).toHaveLength(1);
    expect(links[0]?.parentElement?.classList.contains('ocx-tabs__action')).toBe(true);
    expect(links[0]?.getAttribute('href')).toBe('/install/');
    expect(links[0]?.textContent?.trim()).toBe('Install guide');
    expect(doc.querySelector('.ocx-cmdbar__action')).toBeNull();
  });

  it('no docs: no action cell in the tab row', async () => {
    expect((await render()).querySelector('.ocx-tabs__action')).toBeNull();
  });
});

describe('InstallCommand SSR: variant bar', () => {
  it('one bar with a shell picker: every shell an option with its icon, the sh line shown first', async () => {
    const doc = await render({ variant: 'bar' });
    expect(doc.querySelector('.ocx-tabs')).toBeNull();
    expect(doc.querySelectorAll('.ocx-cmdbar')).toHaveLength(1);
    const options = [...doc.querySelectorAll('.ocx-cmdbar__picker option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(SHELLS.map(([, icon]) => icon));
    expect(doc.querySelector('.ocx-cmdbar__text')?.textContent?.trim()).toBe(SHELLS[0]![2]);
    const choices = JSON.parse(doc.querySelector('.ocx-cmdbar')?.getAttribute('data-choices') ?? '[]') as {
      command: string;
    }[];
    expect(choices.map((c) => c.command)).toEqual(SHELLS.map(([, , command]) => command));
    expect(doc.querySelector('.ocx-cmdbar__action')).toBeNull();
  });

  it('docs: the bar ends with an icon-only install-guide link, named and hinted', async () => {
    const action = (await render({ variant: 'bar', docs: true })).querySelector('.ocx-cmdbar__action');
    const a = action?.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/install/');
    expect(a?.getAttribute('aria-label')).toBe('Install guide');
    expect(a?.textContent?.trim()).toBe('');
    expect(a?.querySelector('svg')).not.toBeNull();
    expect(action?.textContent).toContain('Install guide');
  });
});
