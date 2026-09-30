// @vitest-environment jsdom
// C-273 TagsInput rules (pure helpers of tags-input.zag.mjs): what a typed text adds or why not,
// the popup rows (added values gone, filtered, the create row), and chip labels.
import { describe, expect, it } from 'vitest';
import {
  CREATE,
  canCreate,
  findSuggestion,
  labelOf,
  optionsFor,
  readSuggestions,
  removeLabel,
  resolve,
} from '../src/components/ui/tags-input.zag.mjs';

const suggestions = [
  { value: 'k8s', label: 'kubernetes' },
  { value: 'docker', label: 'docker' },
  { value: 'cli', label: 'command line' },
];
const closed = { suggestions, allowCreate: false };
const open = { suggestions, allowCreate: true };

describe('resolve (the validate rule)', () => {
  it('a suggestion value or label, any case, adds the suggestion value', () => {
    expect(resolve('k8s', [], closed)).toEqual({ value: 'k8s' });
    expect(resolve('  Kubernetes ', [], closed)).toEqual({ value: 'k8s' });
    expect(resolve('COMMAND LINE', [], closed)).toEqual({ value: 'cli' });
  });

  it('unknown text is rejected without allowCreate and added as typed (trimmed) with it', () => {
    expect(resolve('foo', [], closed)).toEqual({ value: 'foo', reason: 'unknown' });
    expect(resolve(' foo ', [], open)).toEqual({ value: 'foo' });
  });

  it('duplicates are rejected, also when named by the label', () => {
    expect(resolve('kubernetes', ['k8s'], closed)).toEqual({ value: 'k8s', reason: 'duplicate' });
    expect(resolve('foo', ['foo'], open)).toEqual({ value: 'foo', reason: 'duplicate' });
  });

  it('nothing past max; blank text is no attempt at all', () => {
    expect(resolve('docker', ['k8s'], { ...closed, max: 1 })).toEqual({ value: 'docker', reason: 'max' });
    expect(resolve('docker', [], { ...closed, max: 1 })).toEqual({ value: 'docker' });
    expect(resolve('   ', [], open)).toBeNull();
  });

  it('findSuggestion matches whole values or labels only', () => {
    expect(findSuggestion(suggestions, 'kube')).toBeUndefined();
    expect(findSuggestion(suggestions, 'DOCKER')?.value).toBe('docker');
  });
});

describe('optionsFor (the popup rows)', () => {
  const values = (items: { value: string }[]) => items.map((i) => i.value);

  it('added values leave the list; an empty query keeps the given order', () => {
    expect(values(optionsFor('', ['docker'], closed))).toEqual(['k8s', 'cli']);
  });

  it('the query filters by label under the match mode (fuzzy by default)', () => {
    expect(values(optionsFor('kub', [], closed))).toEqual(['k8s']);
    expect(values(optionsFor('kbrnts', [], closed))).toEqual(['k8s']); // subsequence
    expect(values(optionsFor('line', [], { ...closed, matchMode: 'startsWith' }))).toEqual([]);
    expect(values(optionsFor('line', [], { ...closed, matchMode: 'contains' }))).toEqual(['cli']);
    expect(values(optionsFor('kub', ['k8s'], closed))).toEqual([]);
  });

  it('the create row comes last, only when allowed, new, not a suggestion and under max', () => {
    expect(optionsFor('kub', [], open).at(-1)).toEqual({ value: CREATE, label: 'Create "kub"' });
    expect(values(optionsFor('kub', [], closed))).not.toContain(CREATE);
    expect(values(optionsFor('docker', [], open))).not.toContain(CREATE); // names a suggestion
    expect(values(optionsFor('foo', ['foo'], open))).not.toContain(CREATE); // duplicate
    expect(values(optionsFor('foo', ['a'], { ...open, max: 1 }))).not.toContain(CREATE);
    expect(values(optionsFor('  ', [], open))).toEqual(['k8s', 'docker', 'cli']);
  });

  it('canCreate agrees with the rows', () => {
    expect(canCreate('new-tag', [], open)).toBe(true);
    expect(canCreate('new-tag', [], closed)).toBe(false);
    expect(canCreate('Kubernetes', [], open)).toBe(false);
  });
});

describe('chip labels', () => {
  it('a known value shows its suggestion label, anything else itself; remove buttons are named by it', () => {
    expect(labelOf(suggestions, 'k8s')).toBe('kubernetes');
    expect(labelOf(suggestions, 'legacy')).toBe('legacy');
    expect(removeLabel(labelOf(suggestions, 'cli'))).toBe('Remove command line');
  });
});

describe('readSuggestions (the SSR popup rows are the only copy)', () => {
  it('reads value and label in order (the row shows meta; nothing at runtime reads it), skipping the create row', () => {
    const root = document.createElement('div');
    root.innerHTML = `<ul>
      <li data-scope="combobox" data-part="item" data-value="k8s"><span data-part="item-text">kubernetes</span><span class="ocx-ui-option__meta">312</span></li>
      <li data-scope="combobox" data-part="item" data-value="cli" hidden><span data-part="item-text">cli</span></li>
      <li data-scope="combobox" data-part="item" data-value="${CREATE}"><span data-part="item-text"></span></li>
    </ul><span data-scope="tags-input" data-part="item" data-value="chip"></span>`;
    expect(readSuggestions(root)).toEqual([
      { value: 'k8s', label: 'kubernetes' },
      { value: 'cli', label: 'cli' },
    ]);
  });
});
