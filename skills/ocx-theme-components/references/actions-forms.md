# Actions and forms

You loaded this file because a page needs a button, a field, a picker or chips.
Import path prefix: `@ocx-sh/theme/components/`.

Contents: [Actions](#actions) · [Toggles](#toggles) · [Text fields](#text-fields) ·
[Pickers](#pickers) · [Choices and ranges](#choices-and-ranges) · [Chips](#chips)

## Actions

**`ui/Button.astro`** renders `<a>` when `href` is set, else
`<button type="button">`.

| Prop | Values | Notes |
|---|---|---|
| `variant` | `primary`, `secondary` (default), `ghost` | Primary is the coral fill: one per view |
| `size` | `s` (30, mono), `m` (38, default), `l` (42) | |
| `iconOnly` | `true` | Square button; the type requires `aria-label` |
| `type` | `button`, `submit`, `reset` | Button form only |
| `aria-disabled="true"` | | On a link it drops `href`, so it takes no focus |

```astro
<Button variant="primary" href="/install/">Install</Button>
<Button iconOnly aria-label="Settings"><Icon name="edit" /></Button>
```

**`ui/Link.astro`**: `href` (required), `tone` `accent` (default) or `neutral`
(footers, meta), `underline` `always`, `hover` or `none` (then give a
non-colour cue yourself), `external` (default: an absolute URL off
`Astro.site`, appends the external icon), `newTab` (never implied by
`external`).

**`CopyButton.astro`**: `value` (required), `label` (what the toast names
instead of the value). Reads "copied" for 1.5 s (a second copy restarts it) and
toasts "Copied — label" for 2 s. No clipboard API or a refused write never
throws: "Copy failed" (danger) and no copied state. Events
`ocx:clipboard:copy`, `ocx:clipboard:error`. Every copy control toasts the same
way, in the `copy` slot, so a new one replaces the one showing; to copy from
your own script call `copyWithToast(target, text, meaning)` from
`@ocx-sh/theme/copy` (also `writeClipboard`, `toastCopy`; none throws).

**`CopyMenu.astro`**: a menu of copy items. `label` (trigger text; the menu's
name in context mode), `items` (`{ value, label, meaning?, text?, icon? }[]`;
`meaning` is what the toast names, default the label without a leading
"Copy "), `context`, `placement`, `triggerIcon` (button shape: an icon-only trigger, `label` stays its accessible name), `zag`. Button shape: each item has its
`text`. `context` shape: the default slot holds hosts, elements with
`data-copy='{"<item value>":"<text>"}'`; right-click, the menu key, Shift+F10 or
a long-press on a host opens one shared menu at the pointer with the items that
host has a text for. The data lives on the host, never in script state, so a
menu requested before the island loads still copies that host's text. The menu
adds no Tab stop (give a host `tabindex="0"`, or make it a link or button), focus
returns to the host on close, and empty space or an element without `data-copy`
keeps the browser's own menu. Nothing but host lookup loads with the page: the machine and
the copy code load on the first focus, touch press or context request on a host (the
root is `data-zag-trigger="manual"`); a request made earlier is held and replayed. Events
`ocx:menu:select`, `ocx:menu:change`. The component exports its `Props` type.

**`ProseCodeCopy.astro`**: place once in a layout; no props, no markup. Its
script adds a "Copy code" button to every `pre` inside `.ocx-prose`,
`.sl-markdown-content` or `.vp-doc` (Expressive Code frames keep their own) and
toasts "Copied — code block". Buttons are inserted on load, not on hover, so
assistive technology finds them.

**`ui/CommandBar.astro`**: one copyable command. `choices` (required,
`{ value, label, command, icon? }[]`): none means an action-only bar, one
means no picker, more renders a compact `Select` picker. `pickerLabel` names
the picker ("Platform"); `pickerText` shows the choice label beside its icon;
`noun` finishes the copy toast ("install command"); `lang` highlights the commands
at build time in the code-block colours (a Shiki id such as `sh`, `powershell`;
`choice.lang` overrides it per choice; an unknown id fails the build); `prompt` is a decorative shell prompt (`$`) before the command, `icon` a decorative registry glyph before the prompt (neither is copied; `choice.icon` is the picker's); `detect` preselects the
visitor's OS before first paint (choice values `linux`, `macos`, `windows`).
Slot `action` adds trailing controls: an icon-only link Button with an
`aria-label`, wrapped in a `Hint`.
To retarget the bar from code dispatch `ocx:command-bar:set` `{ command?, label?, choices?, value? }` on it: `choices` replaces the
options, `value` picks one. Like the other set events it is silent once (no `change`; a later visitor pick of the same value is announced).

**`InstallCommand.astro`**: how to install ocx, for any page that says so. One tab per
shell (sh, PowerShell, Nushell, fish, Elvish), each a `CommandBar` with the line typed
in that shell, highlighted in its grammar; the tabs sync on `shell`. The commands live in the theme: never copy them
into a page. `variant="bar"` is the short form, one `CommandBar` with a shell
picker. `docs` adds an "Install guide" link to `/install/`: at the end of the tab
row (Tabs slot `action`), or a `docs` icon button with a Hint at the end of the bar.

## Toggles

| Component | Props that matter | Event |
|---|---|---|
| `ui/ToggleButton.astro` | `pressed`, `value`, `size` `s`/`m`, `iconOnly` (requires `aria-label`) | `ocx:toggle-button:change` |
| `ui/CycleButton.astro` | `states` (2+, `{ value, label, icon }`, click order), `value`, `name` (hidden form input), `variant` `ghost`/`secondary`, `size`, `iconOnly` | `ocx:cycle-button:change` |
| `ToggleGroup.astro` | `items` (`{ value, label, icon?, iconOnly?, disabled? }`), `label` (required), `multiple`, `value` | `ocx:toggle-group:change` |

`ToggleGroup` with one selection is a radio group and cannot be emptied; with
`multiple` the items are pressed buttons. To set the pressed value from code
(a URL, stored state) dispatch `ocx:toggle-group:set` `{ value }` (a string or
an array) on the group root: it works before the machine starts, fires no
`change` (one-shot: a later user change to the same value is announced), and replaces any write to `aria-checked`, `data-state` or
`data-zag-props`.

```js
group.dispatchEvent(new CustomEvent('ocx:toggle-group:set', { detail: { value: 'linux' }, bubbles: true }));
```

## Text fields

**`ui/Input.astro`**: `label` (required), `hideLabel`, `type` `text`, `search`,
`url`, `email`, `password`, `number`, `hint`, `error` (replaces the hint, sets
`aria-invalid`; say how to fix it), `stepper` (number only). Slots `start` and
`end` wrap the input in an `InputGroup`. A stepper input renders
`ui/NumberStepperScript.astro` (its one delegated script); a text or search
input carries no script. Never import it directly.

**`ui/InputGroup.astro`**: box around slots `start`, default (the control) and
`end`. `disabled`, `invalid`, `wrap` (chips before the control). No JS: focus,
invalid and disabled come from the control's own state.

**`ui/SearchField.astro`**: `label` (required, the clear button is named
"Clear <label>"), `clearLabel` (the clear button's name when that reads badly),
`hideLabel`, `placeholder` (defaults to `label`, must not be
empty). Escape and the clear button clear it; event `ocx:search-field:clear`.

**`ui/Label.astro`**: `for`, `as` `label` or `span` (for targets a `<label>`
cannot name; give it an `id` and point `aria-labelledby` at it), `hidden`
(visually), `required` (decorative `*`; put `required` on the control),
`disabled`.

## Pickers

**`ui/Select.astro`**: an APG select-only combobox over a hidden native
`<select>`, so it submits in forms. `label` (required), `hideLabel`, `options`
(`{ value, label, meta?, icon?, disabled? }`), `value` (none selects the first
enabled option), `aria-invalid="true"` for the error border (add your own
message). Options added to the native `<select>` at runtime join the list, in the native option order. In an option row with an icon the selected one is also semibold, so the pick is not colour alone.
Slots `start` and `end` put a control inside the box, such as a sort-direction
`CycleButton`; it is its own tab stop and never opens the list. Event
`ocx:select:change` `{ value }`. To choose an option from code dispatch
`ocx:select:set` `{ value }` on the select root: it works before the machine
starts, fires no `change` (one-shot, as for the group) and ignores a value no option carries; never write
`select.value` yourself.

```astro
<Select label="Sort by" options={sortKeys} value="updated">
  <CycleButton slot="start" variant="ghost" size="s" states={directions} value="desc" />
</Select>
```

**`ui/Combobox.astro`**: an editable combobox that filters `options`
(`{ value, label, meta? }`) as the reader types. `label` (required), `value`,
`placeholder`, `matchMode` `fuzzy` (default, one-typo tolerant), `contains`,
`startsWith`, `empty` (no-match text), `disabled`. Initial state: `open`,
`highlighted`, `query`. Slots `start` and `end` as in `Select`.

## Choices and ranges

**`ui/Choice.astro`**: `type` `checkbox` (default), `switch` or `radio`, `label`
(required), plus any native input attribute (`name`, `checked`, `required`).
The native input is the source of truth, so it works with JS off. A group of
radios is `RadioGroup`, never several `Choice`s.

**`ui/RadioGroup.astro`**: `label` (required), `name` (required), `items`
(`{ value, label, disabled? }`), `value`, `orientation`.

**`ui/Slider.astro`**: `label` (required), `value` (number = one thumb, pair =
range), `min`, `max`, `step`, `name` (one hidden input per thumb), `marks`,
`format` (`Intl.NumberFormatOptions`), `thumbLabels`, `showValue` (default
true), `disabled`.

## Chips

**`ui/Tag.astro`**: behaviour-free chip. `variant` `label` (tint, a category),
`stamp` (outline caps, a status fact), `filter` (toggle chip, driven by a
group); `tone` `neutral`, `keyword`, `success`, `warning`, `danger`;
`removable` requires `removeLabel`.

**`ui/TagGroup.astro`**: `label` (required), `items`
(`{ value, label, disabled?, tone? }`, value without whitespace),
`selectionMode` `none` (default), `single` or `multiple`, `value`. `removable`
(with `removeLabel`, `{label}` substituted) works only with
`selectionMode="none"`; removal fires a cancelable `ocx:tag-group:remove`.

**`ui/TagsInput.astro`**: `label` (required), `value` (the tags),
`suggestions` (`{ value, label, meta? }`), `allowCreate` (default: true without
suggestions, false with), `matchMode`, `max`, `delimiter`, `name` (tags joined
by ", "), `placeholder`, `hint`, `error`, `disabled`, `readOnly`, `empty`.
