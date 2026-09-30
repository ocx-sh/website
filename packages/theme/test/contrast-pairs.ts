// [foreground, background] token pairs (names without the `--ocx-color-` prefix)
// that the design guide puts together. Both schemes, contract C-030.

/** Body-size text: WCAG AA 4.5:1. */
export const TEXT_PAIRS: [string, string][] = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'surface'],
  ['fg-subtle', 'bg'],
  ['fg-subtle', 'surface'],
  ['fg-subtle', 'surface-subtle'],
  ['accent-fg', 'bg'],
  ['accent-fg', 'surface'],
  ['on-accent', 'accent'],
  ['code-fg', 'code-bg'],
  ['code-comment', 'code-bg'],
  ['code-punctuation', 'code-bg'],
  ['code-keyword', 'code-bg'],
  ['code-string', 'code-bg'],
  ['code-number', 'code-bg'],
  ['code-function', 'code-bg'],
  ['code-variable', 'code-bg'],
  ['code-deleted', 'code-bg'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['danger', 'surface'],
  ['keyword', 'surface'],
  ['on-inverse', 'inverse'],
];

/** Non-text UI (WCAG 1.4.11, 3:1): the focus ring and the thin active/selected markers that share its token,
 * and border-control, the edge of an interactive boundary (control edges, hover border).
 * border / border-strong are decorative dividers in the design guide, so not listed. */
export const UI_PAIRS: [string, string][] = [
  ['focus', 'bg'],
  ['focus', 'surface'],
  ['focus', 'code-bg'],
  ['border-control', 'bg'],
  ['border-control', 'surface'],
  ['border-control', 'surface-subtle'],
  // Slider: the thumb edge on the page/card/its own fill, the range on the track (border).
  ['focus', 'surface-subtle'],
  ['focus', 'border'],
  ['scrollbar-thumb', 'bg'],
  ['scrollbar-thumb', 'surface'],
  ['scrollbar-thumb-hover', 'bg'],
  ['scrollbar-thumb-hover', 'surface'],
];

/** Surfaces a Tag sits on: page, card, and subtle panels (table heads, list rows, showcase bars). */
export const TAG_BASES = ['bg', 'surface', 'surface-subtle'];

/** Expressive Code marked lines (starlight.css › --ec-tm-*Bg): a translucent tint composited
 * over code-bg, under every code token, plus the line's own +/- diff indicator colour. */
const CODE_TOKENS = [
  'code-fg',
  'code-comment',
  'code-punctuation',
  'code-keyword',
  'code-string',
  'code-number',
  'code-function',
  'code-variable',
  'code-deleted',
];
export const CODE_LINE_TINTS: [string, string[]][] = [
  ['accent-tint', CODE_TOKENS],
  ['success-tint', [...CODE_TOKENS, 'success']],
  ['danger-tint', [...CODE_TOKENS, 'danger']],
];

/** Status labels (tags, chips): the status colour on its own tint, composited over the page and card surfaces. */
export const STATUS_TINTS: [string, string][] = [
  ['success', 'success-tint'],
  ['warning', 'warning-tint'],
  ['danger', 'danger-tint'],
  ['keyword', 'keyword-tint'],
  ['accent-fg', 'accent-tint'],
];
