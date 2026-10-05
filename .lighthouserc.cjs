/**
 * Lighthouse CI config for `task lighthouse` (C-057), read by `scripts/lighthouse.mjs`
 * (lanes, retry-on-fail, cache; it judges with lhci's own assertion engine) and still a valid
 * `lhci autorun` config. `scripts/lhci-stage.mjs` copies `site/dist` to `STAGE_ROOT`
 * and `examples/starlight/dist` to its `docs/`; `staticDistDir` below serves that same root, and
 * every URL is a site path or a `/docs/...` path the static server resolves. Requiring this file
 * needs `site/dist` (`missing dist: site/dist`).
 *
 * `STAGE_ROOT` is `scripts/lhci-stage.mjs`'s own export, `require()`d
 * directly (Node 24's `require(esm)` support) rather than duplicated.
 *
 * Category thresholds: C-057 requires score 1 in all four categories on the
 * median of 3 runs, so every category assertion is `error` at `minScore: 1` —
 * no ratchet-then-margin here, the contract is the literal max. Weight and
 * DOM budgets come from tests/budgets.mjs (C-110, C-111).
 */
const { chromium } = require('playwright-core');
const { STAGE_ROOT } = require('./scripts/lhci-stage.mjs');
const { BUDGETS, CLASS_PATTERNS, PRE_JS_VISIBLE, budgetOf, examplePages, sitePages } = require('./tests/budgets.mjs');

// C-111 / D-Z15: every committed example page (minus samples/**) plus the static 404.html, derived
// from the source tree by tests/budgets.mjs, then every HTML page of the built root site (C-309).
const AUDITED_URLS = [...examplePages(), ...sitePages()];

const CATEGORIES = Object.fromEntries(
  ['performance', 'accessibility', 'best-practices', 'seo'].map((c) => [`categories:${c}`, ['error', { minScore: 1 }]]),
);

/** @param {import('./tests/budgets.mjs').Budget} budget */
const assertions = (budget) => ({
  ...CATEGORIES,
  'resource-summary:script:size': ['error', { maxNumericValue: budget.preJsGz }],
  'total-byte-weight': ['error', { maxNumericValue: budget.totalBytes }],
  'dom-size': ['error', { maxNumericValue: budget.domElements }],
});
const own = Object.keys(PRE_JS_VISIBLE);
// One block per page class (C-110): its pathname pattern, prefixed to match lhci's full URLs,
// minus the pages with their own preJsGz cap, which get one block each.
const ASSERT_MATRIX = [
  .../** @type {(keyof typeof BUDGETS)[]} */ (Object.keys(BUDGETS)).map((cls) => ({
    matchingUrlPattern: `^https?://[^/]+${own.map((p) => `(?!${p}$)`).join('')}${CLASS_PATTERNS[cls].slice(1)}`,
    assertions: assertions(BUDGETS[cls]),
  })),
  ...own.map((p) => ({ matchingUrlPattern: `^https?://[^/]+${p}$`, assertions: assertions(budgetOf(p)) })),
];

module.exports = {
  ci: {
    collect: {
      staticDistDir: STAGE_ROOT,
      url: AUDITED_URLS,
      // One run; the runner gives a failing URL RETRY_RUNS (3) and judges its median run.
      numberOfRuns: 1,
      // Collect-level, not under `settings`: lhci's healthcheck and runner read it here.
      chromePath: process.env.CHROME_PATH || chromium.executablePath(),
      // The full-page screenshot only illustrates the report; no audit scores it.
      settings: { chromeFlags: '--headless=new --no-sandbox', disableFullPageScreenshot: true },
    },
    assert: { assertMatrix: ASSERT_MATRIX },
  },
};
