// CommandBar behaviour (no Zag import here: the copy machine is clipboard.zag.mjs, loaded by `mount`
// on first interaction, exactly as for CopyButton). Three jobs: (1) `apply` shows one choice, before
// first paint through PRE_PAINT and later on a pick; (2) `install` wires picks to the copy machine
// and keeps a live status; (3) nothing else: copying, the check state and the toast are the
// clipboard machine's.
import { mount } from './zag.mjs';

/**
 * Shows choice `value` on `bar`: command text, copy name (toast + accessible name), the machine's
 * start value, the picker's own text, glyph, name and tooltip. Idempotent. Self-contained on purpose (no imports,
 * no free variables, no named inner functions): PRE_PAINT ships its source inline.
 * @param {HTMLElement} bar
 * @param {string} value
 * @returns {string | undefined} the command, or undefined when `value` is not a choice
 */
export function apply(bar, value) {
  /** @type {unknown} */
  const parsed = JSON.parse(bar.dataset['choices'] ?? '[]');
  const choice = /** @type {{ value: string, label: string, command: string, html?: string }[]} */ (parsed).find(
    (c) => c.value === value,
  );
  const root = /** @type {HTMLElement | null} */ (bar.querySelector('[data-zag-root="clipboard"]'));
  if (!choice || !root) return undefined;
  const name = `${choice.label} ${bar.dataset['noun']}`;
  const text = bar.querySelector('.ocx-cmdbar__text');
  // `html` is the bar's own SSR highlighting; choices a consumer sets carry none (setChoices drops it).
  if (text && choice.html) text.innerHTML = choice.html;
  else if (text) text.textContent = choice.command;
  root.dataset['label'] = name;
  root.querySelector('[data-part="trigger"]')?.setAttribute('aria-label', `Copy ${name}`);
  // A machine that starts later begins from this value (`defaultValue`, so `setValue` can move it).
  /** @type {unknown} */
  const props = JSON.parse(root.dataset['zagProps'] ?? '{}');
  root.dataset['zagProps'] = JSON.stringify({
    .../** @type {Record<string, unknown>} */ (props),
    defaultValue: choice.command,
  });
  const select = bar.querySelector('select');
  if (select) select.value = value;
  // The trigger's icon: the option carries its markup (Select.astro). Zag's render then finds it in place.
  const glyph = /** @type {HTMLElement | null} */ (bar.querySelector('.ocx-ui-select__glyph'));
  const icon = select && [...select.options].find((o) => o.value === value)?.dataset['icon'];
  if (glyph && icon) {
    glyph.innerHTML = icon;
    glyph.dataset['value'] = value;
  }
  // Icon-only picker: the label (its accessible name) and the tooltip carry the choice.
  const picker = bar.querySelector('.ocx-cmdbar__picker');
  if (picker && bar.dataset['pickerIcon'] !== undefined) {
    const named = `${bar.dataset['pickerLabel']}: ${choice.label}`;
    picker.setAttribute('title', named);
    const label = picker.querySelector('label');
    if (label) label.textContent = named;
  }
  const shown = bar.querySelector('.ocx-ui-select [data-part="value-text"]');
  if (shown) shown.textContent = choice.label;
  return choice.command;
}

/**
 * The visitor's OS as a choice value: 'windows', 'macos' or 'linux'; undefined when unknown
 * (a phone, a console). Self-contained, see `apply`.
 * @param {{ userAgentData?: { platform?: string }, platform?: string, userAgent?: string }} nav
 * @returns {'windows' | 'macos' | 'linux' | undefined}
 */
export function host(nav) {
  const p = (nav.userAgentData?.platform || nav.platform || nav.userAgent || '').toLowerCase();
  if (p.startsWith('win')) return 'windows';
  if (p.includes('mac')) return 'macos';
  if (p.includes('linux') || p.includes('x11')) return 'linux';
  return undefined;
}

/**
 * Inline script, placed in the field straight after the command text (the picker is parsed by then)
 * so that it runs during parsing, before first paint: SSR renders the first choice, this swaps to the visitor's platform
 * when the bar offers it (a choice whose `value` is 'linux', 'macos' or 'windows'). Never throws.
 */
export const PRE_PAINT = `(()=>{try{const apply=${String(apply)},host=${String(host)},bar=document.currentScript.closest('.ocx-cmdbar'),os=host(navigator);if(bar&&os)apply(bar,os)}catch{}})()`;

/** @typedef {{ value: string, label: string, command: string }} Choice */

/**
 * Replaces the bar's choices: the data, the picker's width and its options. A swapped choice keeps the
 * icon its label had (the registry markup lives only in the SSR options); a label the bar never rendered gets none.
 * @param {HTMLElement} bar
 * @param {Choice[]} choices
 */
function setChoices(bar, choices) {
  bar.dataset['choices'] = JSON.stringify(choices.map(({ value, label, command }) => ({ value, label, command })));
  bar.style.setProperty('--ocx-cmdbar-ch', String(Math.max(0, ...choices.map((c) => c.label.length))));
  const select = bar.querySelector('select');
  const icons = new Map([...(select?.options ?? [])].map((o) => [o.text, o.dataset['icon']]));
  select?.replaceChildren(
    ...choices.map((c) => {
      const option = new Option(c.label, c.value);
      const icon = icons.get(c.label);
      if (icon) option.dataset['icon'] = icon;
      return option;
    }),
  );
}

/**
 * Wires every bar: a pick moves the copy machine's value, a copy is announced in the bar's status.
 * @param {Document} [doc]
 */
export function install(doc = document) {
  for (const bar of /** @type {NodeListOf<HTMLElement>} */ (doc.querySelectorAll('.ocx-cmdbar'))) {
    const root = /** @type {HTMLElement | null} */ (bar.querySelector('[data-zag-root="clipboard"]'));
    if (!root) continue;
    // Idempotent per root: CopyButton's own script may have mounted it already.
    const handle = mount(root, { load: () => /** @type {Promise<any>} */ (import('../clipboard.zag.mjs')) });
    const status = bar.querySelector('.ocx-cmdbar__status');
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    // ponytail: a second copy inside the 2 s window keeps the same text, so it is not announced again.
    const say = (/** @type {string} */ text) => {
      if (!status) return;
      status.textContent = text;
      clearTimeout(timer);
      timer = setTimeout(() => (status.textContent = ''), 2000);
    };
    bar.addEventListener('ocx:select:change', (event) => {
      const command = apply(bar, /** @type {CustomEvent<{ value: string }>} */ (event).detail.value);
      if (command !== undefined)
        /** @type {{ setValue?: (value: string) => void } | undefined} */ (handle.api)?.setValue?.(command);
    });
    // `ocx:command-bar:set {command?, label?, choices?, value?}`: a consumer retargets the bar. `choices` replaces the
    // picker's choices, `value` picks one (the command follows it); `command` alone sets the shown command. The
    // text, the copy name and the machine's value follow, with no pick event.
    bar.addEventListener('ocx:command-bar:set', (event) => {
      const {
        label,
        choices,
        value,
        command: given,
      } = /** @type {CustomEvent<{ command?: string, label?: string, choices?: Choice[], value?: string } | null>} */ (
        event
      ).detail ?? {};
      // An unknown `value` changes nothing, with or without `choices`: no swap that would strand the shown command.
      /** @type {unknown} */
      const stored = JSON.parse(bar.dataset['choices'] ?? '[]');
      const known = choices ?? /** @type {Choice[]} */ (stored);
      if (value !== undefined && !known.some((c) => c.value === value)) return;
      if (choices) setChoices(bar, choices);
      const picked = value === undefined ? undefined : apply(bar, value);
      const command = picked ?? given;
      if (value !== undefined)
        bar
          .querySelector('[data-zag-root="select"]')
          ?.dispatchEvent(new CustomEvent('ocx:select:set', { detail: { value } }));
      if (command === undefined) return;
      const text = bar.querySelector('.ocx-cmdbar__text');
      // A pick has drawn its text already, highlighting included.
      if (text && picked === undefined) text.textContent = command;
      if (label) root.dataset['label'] = `${label} ${bar.dataset['noun']}`;
      /** @type {unknown} */
      const props = JSON.parse(root.dataset['zagProps'] ?? '{}');
      root.dataset['zagProps'] = JSON.stringify({
        .../** @type {Record<string, unknown>} */ (props),
        defaultValue: command,
      });
      /** @type {{ setValue?: (value: string) => void } | undefined} */ (handle.api)?.setValue?.(command);
    });
    bar.addEventListener('ocx:clipboard:copy', () => say(`Copied ${root.dataset['label']}`));
    bar.addEventListener('ocx:clipboard:error', () => say('Copy failed'));
  }
}
