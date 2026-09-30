// Mock ↔ site pairs for `task visual` (C-058). `mock.file` is a design export in
// .tmp/design/, `mock.id` the element id inside it; `path` is under the example
// site's /docs/ base.

export interface MockRef {
  readonly file: string;
  readonly id: string;
}

/** One step run on the site page before the shot: exactly one action key names the target selector. */
export interface OpenStep {
  readonly click?: string;
  readonly hover?: string;
  readonly focus?: string;
  readonly type?: string;
  /** Text typed for a `type` step. */
  readonly text?: string;
}

export interface Pair {
  readonly name: string;
  /** Design-sheet tile; absent means no matching tile exists yet (report row shows "no tile"). */
  readonly mock?: MockRef;
  readonly path: string;
  /** Site selector cropped to an element screenshot instead of the full page. */
  readonly selector?: string;
  /** Action(s) opening an overlay before the shot; waits for it to settle before screenshotting. */
  readonly open?: OpenStep | readonly OpenStep[];
}

const SITE = 'OCX Site Mocks.dc.html';
const COMPONENTS = 'OCX Components.dc.html';

export const PAIRS: readonly Pair[] = [
  { name: 'docs article', mock: { file: SITE, id: '1b' }, path: '/docs/samples/ocx/installation/' },
  { name: 'python api reference', mock: { file: SITE, id: '1c' }, path: '/docs/samples/python-sdk/reference/api/' },
  { name: 'bazel rules reference', mock: { file: SITE, id: '1d' }, path: '/docs/samples/rules_ocx/defs/' },
  { name: 'not found', mock: { file: SITE, id: '1f' }, path: '/docs/404/' },
  { name: 'code', mock: { file: COMPONENTS, id: 'c-code' }, path: '/docs/components/code/' },
  { name: 'callout', mock: { file: COMPONENTS, id: 'c-callout' }, path: '/docs/components/asides/' },
  { name: 'tabs', mock: { file: COMPONENTS, id: 'c-tabs' }, path: '/docs/stories/tabs/default/', selector: '#story' },
  // Components page holds the "Install ocx" LinkCard and a prev/next footer.
  { name: 'pager and cards', mock: { file: COMPONENTS, id: 'c-pager' }, path: '/docs/components/asides/' },
  {
    name: 'button',
    mock: { file: COMPONENTS, id: 'c-button' },
    path: '/docs/stories/button/default/',
    selector: '#story',
  },
  {
    name: 'input',
    mock: { file: COMPONENTS, id: 'c-input' },
    path: '/docs/stories/input/default/',
    selector: '#story',
  },
  { name: 'input group', path: '/docs/stories/input-group/default/', selector: '#story' },
  { name: 'link', path: '/docs/stories/link/default/', selector: '#story' },
  { name: 'slider', path: '/docs/stories/slider/default/', selector: '#story' },
  { name: 'meter', path: '/docs/stories/meter/default/', selector: '#story' },
  { name: 'tag group', path: '/docs/stories/tag-group/default/', selector: '#story' },
  { name: 'tag', mock: { file: COMPONENTS, id: 'c-tags' }, path: '/docs/stories/tag/states/', selector: '#story' },
  // Filter chip, off and on (the on state is "current": coral ink, tint, edge and a check).
  {
    name: 'filter chip off',
    path: '/docs/stories/tag/states/',
    selector: '#story .ocx-ui-tag[data-variant=filter][aria-pressed=false]:not([disabled])',
  },
  {
    name: 'filter chip on',
    path: '/docs/stories/tag/states/',
    selector: '#story .ocx-ui-tag[data-variant=filter][aria-pressed=true]',
  },
  // Stage Z (C-240): every Zag-backed showcase page with a sheet tile. Accordion, Collapsible, Popover,
  // Dialog, Drawer, TreeView, Toc and Pagination have none (plan › Design questions).
  { name: 'header', mock: { file: COMPONENTS, id: 'c-header' }, path: '/docs/' },
  {
    name: 'toggle group',
    mock: { file: COMPONENTS, id: 'c-choice' },
    path: '/docs/stories/toggle-group/default/',
    selector: '#story',
  },
  {
    name: 'choice',
    mock: { file: COMPONENTS, id: 'c-choice' },
    path: '/docs/stories/choice/default/',
    selector: '#story',
  },
  {
    name: 'radio group',
    mock: { file: COMPONENTS, id: 'c-choice' },
    path: '/docs/stories/radio-group/default/',
    selector: '#story',
  },
  {
    name: 'select',
    mock: { file: COMPONENTS, id: 'c-select' },
    path: '/docs/stories/select/default/',
    selector: '#story',
  },
  {
    name: 'combobox',
    mock: { file: COMPONENTS, id: 'c-combobox' },
    path: '/docs/stories/combobox/default/',
    selector: '#story',
  },
  {
    name: 'action menu',
    mock: { file: COMPONENTS, id: 'c-menu' },
    path: '/docs/stories/action-menu/default/',
    selector: '#story',
  },
  { name: 'menu', mock: { file: COMPONENTS, id: 'c-menu' }, path: '/docs/stories/menu/default/', selector: '#story' },
  {
    name: 'hint',
    mock: { file: COMPONENTS, id: 'c-feedback' },
    path: '/docs/stories/hint/default/',
    selector: '#story',
  },
  {
    name: 'copy and toast',
    mock: { file: COMPONENTS, id: 'c-feedback' },
    path: '/docs/stories/copy-button/default/',
    selector: '#story',
  },
  // Open-overlay states (retro P-7): no sheet tile covers these yet, so mock is omitted ("no tile").
  {
    name: 'select listbox open',
    path: '/docs/stories/select/default/',
    open: { click: '#story .ocx-ui-select__control' },
    selector: '#story .ocx-ui-select__list',
  },
  {
    name: 'combobox listbox open',
    path: '/docs/stories/combobox/default/',
    // Focus first: the machine loads lazily on it (D-Z17), and only then does typing open the list.
    open: [
      { focus: '#story [data-scope="combobox"][data-part="input"]' },
      { type: '#story [data-scope="combobox"][data-part="input"]', text: 'a' },
    ],
    selector: '#story .ocx-ui-combobox__list',
  },
  {
    name: 'action menu open',
    path: '/docs/stories/action-menu/default/',
    open: { click: '#story [data-part="trigger"]' },
    selector: '#story [data-part="content"]',
  },
  {
    name: 'dialog open',
    path: '/docs/stories/dialog/default/',
    open: { click: '#story [data-part="trigger"]' },
    selector: '#story .ocx-ui-dialog__content',
  },
  {
    name: 'toast open',
    path: '/docs/stories/copy-button/default/',
    open: { click: '#story button' },
    selector: '[data-zag-root="toast"] [data-part="root"]', // the toast card: the group wrapper is a
    // zero-height flex box around its absolutely-positioned children, so cropping it fails visibility
  },
];
