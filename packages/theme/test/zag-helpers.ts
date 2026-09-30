// Shared assertions for Zag-backed wrappers (C-108): SSR markup must equal what
// the machine's connect() yields for the same props (C-130a).
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { expect } from 'vitest';
import { ssrAttrs } from '../src/components/ui/zag-runtime.mjs';

const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };

/** Wrapper-owned presentation attributes, not part of the Zag contract. */
const OWN = (name: string) => name === 'class' || name.startsWith('data-astro-');

/**
 * The first `[data-part="<part>"]` in `html` carries exactly `ssrAttrs(attrs)` (order-insensitive),
 * ignoring `class` and Astro's `data-astro-*` scoping attributes.
 */
export function expectSsrMatchesConnect(html: string, part: string, attrs: Record<string, unknown>): void {
  const el = new JSDOM(html).window.document.querySelector(`[data-part="${part}"]`);
  expect(el, `no [data-part="${part}"] in the rendered html`).not.toBeNull();
  const actual = Object.fromEntries(
    [...(el?.attributes ?? [])].filter((a) => !OWN(a.name)).map((a) => [a.name, a.value]),
  );
  const expected = Object.fromEntries(Object.entries(domAttrs(attrs)).filter(([name]) => !OWN(name)));
  expect(actual, `part "${part}"`).toEqual(expected);
}

/** `ssrAttrs(props)` as the DOM reads it back: a boolean attribute (`true`) renders bare, value "". */
export const domAttrs = (props: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(ssrAttrs(props)).map(([name, value]) => [name, value === true ? '' : value]));
