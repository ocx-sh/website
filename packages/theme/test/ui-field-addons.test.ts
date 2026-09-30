// Select and Combobox slots `start` / `end` (field addons): SSR shape. The slotted control sits in
// the InputGroup box that is Zag's control part, so it is its own tab stop and mount() never replays
// a click on it into the widget. Behaviour (a click opens nothing, Tab reaches it): e2e
// ui-field-addons.spec.ts; select.zag wiring: ui-field-addons.dom.test.ts.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Select = await load('Select');
const Combobox = await load('Combobox');
const select = await import('../src/components/ui/select.zag.mjs');

const OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Updated' },
];
const START = '<button type="button" id="dir">dir</button>';
const END = '<span id="unit" class="ocx-ui-input-group__addon">u</span>';
const UI = new URL('../src/components/ui/', import.meta.url);
const source = (file: string) => readFileSync(new URL(file, UI), 'utf8');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const html = (c: Component, props: Record<string, unknown>, slots?: Record<string, string>) =>
  container.renderToString(c, { props, ...(slots && { slots }) });
const doc = (s: string) => new JSDOM(s).window.document;

describe('field addons: Select slots', () => {
  it('without slots the markup is the bare trigger (no box, no control part)', async () => {
    const d = doc(await html(Select, { label: 'Sort by', options: OPTIONS }));
    expect(d.querySelector('.ocx-ui-input-group, [data-part="control"]')).toBeNull();
    expect(d.querySelector('.ocx-ui-select > [data-part="trigger"]')).not.toBeNull();
  });

  it('with slots an InputGroup box = Zag control part (SSR equals connect) holds start, trigger, end in order', async () => {
    const s = await html(Select, { label: 'Sort by', options: OPTIONS, value: 'updated' }, { start: START, end: END });
    const d = doc(s);
    const id = d.querySelector('[data-zag-root="select"]')?.getAttribute('data-zag-id');
    const api = ssrApi(select.machine, select.connect, {
      id,
      defaultValue: ['updated'],
      collection: select.toCollection(OPTIONS),
    });
    expectSsrMatchesConnect(s, 'control', api.getControlProps());
    const box = d.querySelector('.ocx-ui-select > .ocx-ui-input-group[data-part="control"]');
    expect([...(box?.children ?? [])].map((el) => el.getAttribute('data-part') ?? el.id)).toEqual([
      'dir',
      'trigger',
      'unit',
    ]);
  });

  it('disabled greys the box; an invalid trigger reddens it through the shared :has rule', async () => {
    const d = doc(
      await html(
        Select,
        { label: 'Sort by', options: OPTIONS, disabled: true, 'aria-invalid': 'true' },
        { start: START },
      ),
    );
    const box = d.querySelector('[data-part="control"]');
    expect(box?.hasAttribute('data-disabled')).toBe(true);
    expect(box?.querySelector('[data-part="trigger"]')?.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('field addons: Combobox slots', () => {
  it('start goes before the search icon, end before the clear button, all inside the control part', async () => {
    const d = doc(await html(Combobox, { label: 'Sort by', options: OPTIONS }, { start: START, end: END }));
    const box = d.querySelector('.ocx-ui-input-group[data-part="control"]');
    expect([...(box?.children ?? [])].map((el) => el.getAttribute('data-part') ?? (el.id || el.localName))).toEqual([
      'dir',
      'svg',
      'input',
      'unit',
      'clear-trigger',
    ]);
  });
});

describe('field addons: one shared pattern', () => {
  it("a slotted control's nearest part is the control, so mount() never replays its click into the widget", async () => {
    for (const c of [Select, Combobox]) {
      const d = doc(await html(c, { label: 'Sort by', options: OPTIONS }, { start: START }));
      const btn = d.getElementById('dir');
      expect(btn?.parentElement?.closest('[data-part],[data-zag-root]')?.getAttribute('data-part')).toBe('control');
      expect(btn?.hasAttribute('tabindex'), 'its own native tab stop').toBe(false);
    }
  });

  it('field.css owns the open-popup focus border for every Zag control box; Combobox no longer repeats it', () => {
    expect(source('field.css')).toMatch(
      /\.ocx-ui-input-group\[data-part='control'\]\[data-state='open'\]\s*\{[^}]*--ocx-color-focus/,
    );
    expect(source('Combobox.astro')).not.toMatch(/data-state='open'/);
  });

  it('field.css: the Select trigger inside the box drops its own border and background; a start button hugs the edge', () => {
    const css = source('field.css');
    expect(css).toMatch(/\.ocx-ui-input-group > \.ocx-ui-select__control\s*\{[^}]*border:\s*0;[^}]*\}/);
    expect(css).toMatch(/\.ocx-ui-input-group > \.ocx-ui-select__control\s*\{[^}]*background:\s*transparent/);
    expect(css).toMatch(/\.ocx-ui-input-group:has\(> \.ocx-ui-button:first-child\)\s*\{[^}]*padding-inline-start/);
  });
});
