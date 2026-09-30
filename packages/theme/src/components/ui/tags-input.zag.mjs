// TagsInput (C-273, D-P8) on Zag tags-input with a combobox child on the same input: tags-input
// owns the value, chips, chip navigation and the hidden form input; the combobox (spawned only when
// there are suggestions) owns the popup, its highlight and filtering. One key router decides who
// hears a key: combobox gets ArrowUp/Down and Enter on a highlighted option (Escape while open
// never reaches the input: its layer takes it), tags-input the rest. New chips clone the SSR
// `<template data-ocx-chip>` (D-P9), so their markup and icon have one source.
// ponytail: a suggestion-less TagsInput also loads combobox; split the chunk when a page ships one.
import { collection, connect as comboConnect, machine as comboMachine } from '@zag-js/combobox';
import { connect, machine } from '@zag-js/tags-input';
import { filterItems, highlight, match } from './fuzzy.mjs';
import { leave } from './motion.mjs';
import { emit } from './zag-runtime.mjs';

// The combobox machine too: TagsInput.astro renders the closed popup from it (D-Z17). Named, not
// `import * as`: an exported namespace keeps all of @zag-js/combobox. Nothing from combobox.zag.mjs
// either, or this chunk loads Combobox's own code with it.
export const combobox = { machine: comboMachine, connect: comboConnect };
export { connect, machine };

/** @typedef {{ value: string, label: string, meta?: string | undefined }} Suggestion */
/** @typedef {import('./combobox.zag.mjs').MatchMode} MatchMode */
/** @typedef {{ suggestions: Suggestion[], allowCreate: boolean, max?: number | undefined, matchMode?: MatchMode }} Rules */
/** @typedef {'unknown' | 'duplicate' | 'max'} Reason */

/** Collection value of the "Create "<text>"" row; never a tag value (the typed text is). */
export const CREATE = 'ocx:create';

/** The suggestion whose value or label equals `text`, case-insensitively. @param {Suggestion[]} suggestions @param {string} text */
export const findSuggestion = (suggestions, text) => {
  const t = text.trim().toLowerCase();
  return suggestions.find((s) => s.value.toLowerCase() === t || s.label.toLowerCase() === t);
};

/** What a chip shows: the suggestion's label for a known value, else the value. @param {Suggestion[]} suggestions @param {string} value */
export const labelOf = (suggestions, value) => suggestions.find((s) => s.value === value)?.label ?? value;

/**
 * The value `text` adds (a suggestion's value when it names one), or why it cannot; null for blank text.
 * @param {string} text @param {string[]} value the current tags @param {Rules} rules
 * @returns {{ value: string, reason?: Reason } | null}
 */
export function resolve(text, value, rules) {
  const t = text.trim();
  if (!t) return null;
  const hit = findSuggestion(rules.suggestions, t);
  const v = hit?.value ?? t;
  if (value.includes(v)) return { value: v, reason: 'duplicate' };
  if (!hit && !rules.allowCreate) return { value: t, reason: 'unknown' };
  if (rules.max !== undefined && value.length >= rules.max) return { value: v, reason: 'max' };
  return { value: v };
}

/** Whether the popup offers "Create "<query>"": allowed, new and addable. @param {string} query @param {string[]} value @param {Rules} rules */
export const canCreate = (query, value, rules) =>
  !resolve(query, value, rules)?.reason && !!query.trim() && !findSuggestion(rules.suggestions, query);

/**
 * The popup rows for `query`: suggestions not added yet, filtered (best first for fuzzy), then the
 * create row when it applies.
 * @param {string} query @param {string[]} value @param {Rules} rules
 * @returns {Suggestion[]}
 */
export function optionsFor(query, value, rules) {
  const q = query.trim();
  const free = rules.suggestions.filter((s) => !value.includes(s.value));
  const items = q ? filterItems(free, q, rules.matchMode) : free;
  return canCreate(q, value, rules) ? [...items, { value: CREATE, label: `Create "${q}"` }] : items;
}

/** @param {string} query @param {string[]} value @param {Rules} rules */
export const toCollection = (query, value, rules) => collection({ items: optionsFor(query, value, rules) });

/**
 * The shared input's attributes: tags-input's win (scope, placeholder), combobox adds the APG
 * combobox role, `aria-controls` and `aria-activedescendant`. `readonly` at max stops typing but
 * keeps Backspace onto the chips. Handlers are the caller's (render routes them).
 * @param {Record<string, unknown>} tags @param {Record<string, unknown> | undefined} combo @param {boolean} atMax
 */
export const inputAttrs = (tags, combo, atMax) => ({ ...combo, ...tags, readonly: atMax || !!combo?.readonly });

/**
 * @typedef {object} Ctx
 * @property {HTMLElement} root
 * @property {HTMLInputElement} input
 * @property {Rules & { delimiter: string, readOnly: boolean, disabled: boolean, invalid: boolean }} rules
 * @property {string[]} values latest value, set synchronously by onValueChange
 * @property {string} query latest input text
 * @property {ReturnType<typeof toCollection>} collection the popup rows for `query` and `values`
 * @property {import('@zag-js/tags-input').Api} [tags]
 * @property {import('@zag-js/combobox').Api} [combo]
 * @property {import('./zag.mjs').Child} [child]
 * @property {import('./zag.mjs').Spread} [spread]
 * @property {boolean} started
 * @property {boolean} atMax
 * @property {HTMLElement[]} pool removed chips, reused: spread holds every element it touched until stop
 */
/** @type {WeakMap<HTMLElement, Ctx>} */
const ctxs = new WeakMap();

/** @type {WeakMap<Element, string>} last text marked into each row */
const marked = new WeakMap();
const scope = 'tags-input';
const at = (/** @type {ParentNode} */ el, /** @type {string} */ sel) =>
  /** @type {HTMLElement} */ (el.querySelector(sel));

/** Rebuilds the popup rows and tells the combobox (its props read `ctx.collection` live). @param {Ctx} ctx */
function refresh(ctx) {
  ctx.collection = toCollection(ctx.query, ctx.values, ctx.rules);
  ctx.child?.update({});
}

/** Empties the text in the DOM and both machines. @param {Ctx} ctx */
function clearText(ctx) {
  ctx.input.value = '';
  ctx.query = '';
  ctx.tags?.setInputValue('');
  ctx.combo?.setInputValue('', 'script');
}

/** Adds what `text` names, or emits why not; the text stays on a rejection. @param {Ctx} ctx @param {string} text */
function commit(ctx, text) {
  const r = resolve(text, ctx.values, ctx.rules);
  if (!r) return;
  if (r.reason) return emit(ctx.root, scope, 'invalid', r);
  ctx.tags?.addValue(r.value);
  clearText(ctx);
}

/**
 * Paste: every delimited piece follows the Enter rule; rejected pieces stay as the text.
 * ponytail: ours, not Zag's `addOnPaste`, which validates the whole string once and clears it on a rejection.
 * @param {Ctx} ctx
 */
function paste(ctx) {
  const value = [...ctx.values];
  /** @type {string[]} */
  const rest = [];
  for (const piece of ctx.input.value.split(ctx.rules.delimiter)) {
    const r = resolve(piece, value, ctx.rules);
    if (!r) continue;
    if (r.reason) {
      emit(ctx.root, scope, 'invalid', r);
      rest.push(piece.trim());
    } else {
      value.push(r.value); // sends are queued: track what this paste already added
      ctx.tags?.addValue(r.value);
    }
  }
  ctx.input.value = rest.join(ctx.rules.delimiter);
  return rest.length > 0;
}

/** Spreads the merged input props with the key router. @param {Ctx} ctx */
function paintInput(ctx) {
  if (!ctx.tags || !ctx.spread) return;
  const t = /** @type {Record<string, (e: any) => void>} */ (ctx.tags.getInputProps());
  const c = /** @type {Record<string, (e: any) => void> | undefined} */ (ctx.combo?.getInputProps());
  const { input } = ctx;
  // tags-input skips ←/→ on an expanded combobox; the router already decided, so it sees a plain input.
  const toTags = (/** @type {KeyboardEvent} */ e, key = e.key) =>
    t.onkeydown?.({
      key,
      isComposing: e.isComposing,
      nativeEvent: e,
      get defaultPrevented() {
        return e.defaultPrevented;
      },
      preventDefault: () => e.preventDefault(),
      currentTarget: { getAttribute: () => null, ariaExpanded: null },
    });
  ctx.spread(input, {
    ...inputAttrs(t, c, ctx.atMax),
    onfocusin: (/** @type {FocusEvent} */ e) => {
      c?.onfocusin?.(e);
      t.onfocusin?.(e);
    },
    onkeydown: (/** @type {KeyboardEvent} */ e) => {
      if (e.defaultPrevented || e.isComposing) return;
      const chip = !!ctx.root.querySelector('[data-part="item-preview"][data-highlighted]:not([data-disabled])');
      if (c && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        if (chip) toTags(e, 'ArrowDown'); // leaves the chips (tags-input's ↓), then opens the list
        return c.onkeydown?.(e);
      }
      if (e.key === 'Enter') {
        if (c && input.getAttribute('aria-expanded') === 'true' && input.hasAttribute('aria-activedescendant'))
          return c.onkeydown?.(e);
        e.preventDefault();
        return commit(ctx, input.value);
      }
      if (e.key === 'Escape' && !chip) {
        if (!input.value) return; // nothing to undo: a surrounding dialog may close
        e.preventDefault();
        e.stopPropagation();
        return clearText(ctx);
      }
      toTags(e);
    },
    oninput: (/** @type {InputEvent} */ e) => {
      const { delimiter } = ctx.rules;
      if (e.inputType === 'insertFromPaste') {
        if (!paste(ctx)) return clearText(ctx);
      } else if (delimiter && input.value.endsWith(delimiter)) {
        input.value = input.value.slice(0, -delimiter.length);
        return commit(ctx, input.value);
      }
      ctx.query = input.value;
      c?.oninput?.(e);
      t.oninput?.(e);
    },
  });
}

/**
 * Popup parts (combobox child): rows follow the collection (order, hidden, marks), the create row
 * shows the text, the empty text shows when nothing is left.
 * @param {Ctx} ctx @param {import('@zag-js/combobox').Api} api @param {import('./zag.mjs').Spread} put
 */
function paintPopup(ctx, api, put) {
  ctx.combo = api;
  const { root } = ctx;
  const content = at(root, '[data-part="content"]');
  put(at(root, '[data-part="positioner"]'), api.getPositionerProps());
  put(content, api.getContentProps());
  const rows = /** @type {HTMLElement[]} */ ([...content.querySelectorAll('[data-part="item"]')]);
  const q = ctx.query.trim();
  for (const el of rows) {
    const value = el.dataset.value ?? '';
    const item = ctx.collection.find(value);
    el.hidden = !item;
    if (!item) continue; // a hidden row keeps its last props until the collection has it again
    const text = at(el, '[data-part="item-text"]');
    put(el, api.getItemProps({ item }));
    put(text, api.getItemTextProps({ item }));
    const mark = value === CREATE ? item.label : q;
    if (marked.get(text) !== mark) {
      marked.set(text, mark);
      text.replaceChildren(
        ...(value === CREATE
          ? [item.label]
          : highlight(item.label, match(item.label, q, ctx.rules.matchMode)?.ranges ?? []).map((seg) =>
              seg.mark ? Object.assign(document.createElement('mark'), { textContent: seg.text }) : seg.text,
            )),
      );
    }
  }
  // Fuzzy ranks best first: the rows follow, so ↑/↓ walk them top to bottom.
  const order = ctx.collection.items.map((i) => i.value);
  const shown = rows.filter((el) => !el.hidden).map((el) => el.dataset.value);
  if (order.join('\0') !== shown.join('\0'))
    for (const v of order) content.append(/** @type {HTMLElement} */ (rows.find((el) => el.dataset.value === v)));
  at(root, '.ocx-ui-tags-input__empty').hidden = ctx.collection.size > 0;
  paintInput(ctx);
}

/** `el`, or the first sibling after it that is not leaving. @param {Element | null} el */
const live = (el) => {
  while (el?.hasAttribute('data-leaving')) el = el.nextElementSibling;
  return el;
};

/**
 * One chip per value, in order: SSR chips are kept, new ones come from the pool or the template. A
 * removed chip leaves through leave() (C-302) and then joins the pool. While it leaves, its preview
 * carries `data-disabled`: Zag maps a chip to its value by its index among
 * `[data-part=item-preview]:not([data-disabled])`, so a leaving chip must drop out of that list at
 * once. The order checks skip leaving chips too: moving a live chip re-inserts it, which would
 * replay its enter transition.
 * @param {Ctx} ctx @param {import('@zag-js/tags-input').Api} api @param {import('./zag.mjs').Spread} spread
 */
function paintChips(ctx, api, spread) {
  const control = /** @type {HTMLElement} */ (ctx.input.parentElement);
  const template = /** @type {HTMLTemplateElement} */ (ctx.root.querySelector('template[data-ocx-chip]'));
  const have = new Map(
    [...control.querySelectorAll(':scope > [data-part="item"]:not([data-leaving])')].map((el) => [
      /** @type {HTMLElement} */ (el).dataset.value,
      /** @type {HTMLElement} */ (el),
    ]),
  );
  /** @type {HTMLElement | null} */
  let prev = null;
  api.value.forEach((value, index) => {
    const el =
      have.get(value) ??
      ctx.pool.pop() ??
      /** @type {HTMLElement} */ (/** @type {Element} */ (template.content.firstElementChild).cloneNode(true));
    have.delete(value);
    if (!prev) {
      if (live(control.firstElementChild) !== el) control.prepend(el);
    } else if (live(prev.nextElementSibling) !== el) prev.after(el);
    prev = el;
    const item = { index, value };
    const text = at(el, '[data-part="item-text"]');
    const label = labelOf(ctx.rules.suggestions, value);
    if (text.textContent !== label) text.textContent = label;
    spread(el, api.getItemProps(item));
    spread(at(el, '[data-part="item-preview"]'), api.getItemPreviewProps(item));
    spread(text, api.getItemTextProps(item));
    spread(at(el, '.ocx-ui-tag__remove'), api.getItemDeleteTriggerProps(item));
  });
  for (const el of have.values()) {
    const preview = at(el, '[data-part="item-preview"]');
    preview.setAttribute('data-disabled', '');
    void leave(el).then(() => {
      el.inert = false;
      el.removeAttribute('data-leaving');
      preview.removeAttribute('data-disabled');
      ctx.pool.push(el);
    });
  }
}

/**
 * @param {import('@zag-js/tags-input').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 * @param {import('./zag.mjs').Spawn} spawn
 */
export function render(api, root, spread, spawn) {
  const ctx = /** @type {Ctx} */ (ctxs.get(root));
  const { rules } = ctx;
  ctx.tags = api;
  ctx.spread = spread;
  const atMax = rules.max !== undefined && api.value.length >= rules.max;
  const maxChanged = atMax !== ctx.atMax;
  ctx.atMax = atMax;
  if (!ctx.started) {
    ctx.started = true;
    if (rules.suggestions.length) {
      const input = ctx.input;
      // ponytail: live props (a getter), so a new collection needs only a notify, not a merged
      // copy per keystroke (update() chains every props object it is given).
      const props = {
        id: root.dataset.zagId,
        ids: { input: input.id, control: input.parentElement?.id, label: at(root, '[data-part="label"]').id },
        value: [],
        inputBehavior: 'autohighlight',
        selectionBehavior: 'clear',
        closeOnSelect: false,
        allowCustomValue: true,
        disabled: rules.disabled,
        invalid: rules.invalid,
        defaultInputValue: input.value,
        positioning: { strategy: 'fixed' },
        onInputValueChange: (/** @type {{ inputValue: string }} */ { inputValue }) => {
          ctx.query = inputValue;
          refresh(ctx);
        },
        onSelect: (/** @type {{ itemValue: string }} */ { itemValue }) => {
          const text = input.value; // read before the combobox clears it
          queueMicrotask(() => commit(ctx, itemValue === CREATE ? text : itemValue));
        },
      };
      ctx.child = spawn(
        comboMachine,
        /** @type {any} */ (
          () => ({
            ...props,
            readOnly: rules.readOnly || ctx.atMax,
            collection: ctx.collection,
          })
        ),
        comboConnect,
        (/** @type {import('@zag-js/combobox').Api} */ c, put) => paintPopup(ctx, c, put),
      );
    }
  } else if (maxChanged) ctx.child?.update({});
  spread(root, api.getRootProps());
  root.toggleAttribute('data-max', atMax);
  spread(at(root, '[data-part="label"]'), api.getLabelProps());
  spread(/** @type {HTMLElement} */ (ctx.input.parentElement), api.getControlProps());
  spread(at(root, 'input[hidden]'), api.getHiddenInputProps());
  paintChips(ctx, api, spread);
  paintInput(ctx);
}

/**
 * The suggestions, read back from the SSR popup rows (value, label) so the HTML carries them once.
 * ponytail: no `meta`, the rows already show it and nothing at runtime reads it.
 * @param {HTMLElement} root
 * @returns {Suggestion[]}
 */
export function readSuggestions(root) {
  return [...root.querySelectorAll('[data-scope="combobox"][data-part="item"]')].flatMap((li) => {
    const value = /** @type {HTMLElement} */ (li).dataset.value;
    if (value === undefined || value === CREATE) return [];
    return [{ value, label: li.querySelector('[data-part="item-text"]')?.textContent ?? value }];
  });
}

/**
 * Machine props only the page knows: the SSR chips, text typed before start, the rules and the
 * callbacks. Everything else comes from `data-zag-props`.
 * @type {NonNullable<import('./zag.mjs').ZagModule['readDom']>}
 */
export function readDom(root) {
  const parse = /** @type {(text: string) => unknown} */ (JSON.parse);
  /** @typedef {{ max?: number, delimiter?: string, readOnly?: boolean, disabled?: boolean, invalid?: boolean, translations?: object }} Own */
  const own = /** @type {Own} */ (parse(root.dataset.zagProps ?? '{}'));
  const input = /** @type {HTMLInputElement} */ (root.querySelector('input:not([hidden])'));
  const ctx = /** @type {Ctx} */ ({
    root,
    input,
    rules: {
      suggestions: readSuggestions(root),
      allowCreate: root.hasAttribute('data-ocx-allow-create'),
      max: own.max,
      matchMode: /** @type {MatchMode} */ (root.dataset.ocxMatchMode), // SSR always writes one
      delimiter: own.delimiter ?? ',',
      readOnly: !!own.readOnly,
      disabled: !!own.disabled,
      invalid: !!own.invalid,
    },
    values: [...root.querySelectorAll('[data-part="item-preview"]')].map(
      (el) => /** @type {HTMLElement} */ (el).dataset.value ?? '',
    ),
    query: input.value,
    started: false,
    atMax: false,
    pool: [],
    collection: collection({ items: /** @type {Suggestion[]} */ ([]) }), // placeholder: refresh() replaces it
  });
  refresh(ctx); // no child yet: builds the collection only
  ctxs.set(root, ctx);
  const { suggestions } = ctx.rules;
  return {
    defaultValue: ctx.values,
    defaultInputValue: input.value,
    validate: (/** @type {{ inputValue: string, value: string[] }} */ { inputValue, value }) =>
      !resolve(inputValue, value, ctx.rules)?.reason,
    translations: {
      ...own.translations,
      deleteTagTriggerLabel: (/** @type {string} */ v) => removeLabel(labelOf(suggestions, v)),
    },
    onValueChange: (/** @type {{ value: string[] }} */ { value }) => {
      const added = value.filter((v) => !ctx.values.includes(v));
      ctx.values = value;
      refresh(ctx);
      emit(root, scope, 'change', { value });
      for (const v of added) if (!suggestions.some((s) => s.value === v)) emit(root, scope, 'create', { value: v });
    },
    // Blur clears tags-input's text: the combobox forgets it too.
    onInputValueChange: (/** @type {{ inputValue: string }} */ { inputValue }) => {
      if (inputValue) return;
      ctx.query = '';
      ctx.combo?.setInputValue('', 'script');
    },
    // A highlighted chip means the keys walk chips: the suggestions step aside.
    onHighlightChange: (/** @type {{ highlightedValue: string | null }} */ { highlightedValue }) => {
      if (highlightedValue) ctx.combo?.setOpen(false);
    },
  };
}

/** The remove button's name for a chip label. @param {string} label */
export const removeLabel = (label) => `Remove ${label}`;
