// Track G presets on C-172 Dialog: ConfirmDialog (confirm/cancel) and
// AlertDialog (role=alertdialog, one tone icon, one acknowledge button). Both reuse the base
// Dialog wholesale — SSR/contract coverage for the shared machine lives in ui-zag-overlay.test.ts;
// this file covers only what the presets add: no trigger, the action row, and the tone icon.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const ConfirmDialog = await load('ConfirmDialog');
const AlertDialog = await load('AlertDialog');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

type Opts = { props?: Record<string, unknown> };
async function render(c: Component, { props = {} }: Opts = {}): Promise<Document> {
  const html = await container.renderToString(c, { props });
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

describe('ConfirmDialog', () => {
  it('has no trigger (programmatic open only), labels default, cancel and confirm actions', async () => {
    const doc = await render(ConfirmDialog, { props: { title: 'Remove package', message: 'Undo with `ocx lock`.' } });
    expect(doc.querySelector('[data-part="trigger"]')).toBeNull();
    // Trigger-less: loads on its outside start signal (`ocx:dialog:open`), never on a hover (D-Z11).
    expect(doc.querySelector('[data-zag-root]')?.getAttribute('data-zag-trigger')).toBe('manual');
    expect(doc.querySelector('[data-part="content"]')?.getAttribute('role')).toBe('dialog');
    const [cancel, confirm] = [...doc.querySelectorAll<HTMLElement>('[data-dialog-action]')];
    expect(cancel?.dataset['dialogAction']).toBe('cancel');
    expect(cancel?.textContent?.trim()).toBe('Cancel');
    expect(confirm?.dataset['dialogAction']).toBe('confirm');
    expect(confirm?.textContent?.trim()).toBe('Confirm');
    expect(confirm?.getAttribute('data-variant')).toBe('primary');
    expect(doc.querySelector<HTMLElement>('[data-zag-root]')?.dataset['zagId']).toMatch(/^ocx-ui-confirm-/);
  });

  it('custom labels; cancel is secondary, confirm stays the primary Button', async () => {
    const doc = await render(ConfirmDialog, {
      props: { title: 'Delete', confirmLabel: 'Delete', cancelLabel: 'Keep' },
    });
    const confirm = doc.querySelector<HTMLElement>('[data-dialog-action="confirm"]');
    expect(confirm?.textContent?.trim()).toBe('Delete');
    expect(doc.querySelector('[data-dialog-action="cancel"]')?.textContent?.trim()).toBe('Keep');
    expect(confirm?.getAttribute('data-variant')).toBe('primary');
    expect(doc.querySelector('[data-dialog-action="cancel"]')?.getAttribute('data-variant')).toBe('secondary');
  });

  it('an explicit id is what an `ocx:dialog:open` / `ocx:dialog-result` caller targets', async () => {
    const doc = await render(ConfirmDialog, { props: { id: 'confirm-delete', title: 'Delete' } });
    expect(doc.querySelector<HTMLElement>('[data-zag-root]')?.dataset['zagId']).toBe('confirm-delete');
  });
});

describe('AlertDialog', () => {
  it('defaults to tone info, role=alertdialog, one acknowledge button, no trigger', async () => {
    const doc = await render(AlertDialog, { props: { title: 'Lock file is stale' } });
    expect(doc.querySelector('[data-part="trigger"]')).toBeNull();
    expect(doc.querySelector('[data-part="content"]')?.getAttribute('role')).toBe('alertdialog');
    const ok = doc.querySelector<HTMLElement>('[data-dialog-action="ok"]');
    expect(ok?.textContent?.trim()).toBe('OK');
    expect(doc.querySelector('.ocx-ui-alert__icon')?.getAttribute('data-tone')).toBe('info');
  });

  it.each(['info', 'success', 'warning', 'error'] as const)('renders exactly one icon for tone %s', async (tone) => {
    const doc = await render(AlertDialog, { props: { title: 'x', tone, acknowledgeLabel: 'Got it' } });
    expect(doc.querySelector('.ocx-ui-alert__icon')?.getAttribute('data-tone')).toBe(tone);
    expect(doc.querySelector('.ocx-ui-alert__icon svg')?.getAttribute('data-icon'), 'registry icon').toBe(tone);
    expect(doc.querySelector('[data-dialog-action="ok"]')?.textContent?.trim()).toBe('Got it');
  });
});

describe('C-130f styles (presets)', () => {
  it.each(['ConfirmDialog', 'AlertDialog'])('%s: one <style>, all of it in @layer ocx, tokens only', (name) => {
    const src = readFileSync(new URL(`../src/components/ui/${name}.astro`, import.meta.url), 'utf8');
    const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => (m[1] ?? '').trim());
    expect(styles).toHaveLength(1);
    expect(styles[0]).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(styles[0]?.replace(/var\([^)]*\)/g, ''), 'no literal colours').not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
