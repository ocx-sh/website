import { defineConfig, devices } from '@playwright/test';

// Serves the built example under /docs/ via `astro preview` (no extra static-server dep).
// --ignore-lock: keeps Astro 7 from auto-backgrounding the server in agent shells.
// Port 4322 (override: E2E_PORT) so a running `task dev` on 4321 is never reused as the target.
// A server already on the port is reused only with E2E_REUSE=1: a leftover preview or another
// project's dev server there would otherwise be tested silently.
// The root-site specs run in the `site` project against the combined stage (site/dist at `/`, the
// example under `/docs/`, as ocx.sh serves them) that `scripts/lhci-stage.mjs --serve` stages and
// serves on E2E_SITE_PORT, same reuse rule. They never run against the example preview.
const port = process.env['E2E_PORT'] ?? '4322';
const sitePort = process.env['E2E_SITE_PORT'] ?? '4323';
const reuseExistingServer = process.env['E2E_REUSE'] === '1';
const siteSpecs = /\/(?:site|search)\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env['CI'],
  use: { baseURL: `http://localhost:${port}` },
  webServer: [
    {
      command: `pnpm --dir examples/starlight exec astro preview --ignore-lock --port ${port}`,
      url: `http://localhost:${port}/docs/`,
      reuseExistingServer,
    },
    {
      command: `node scripts/lhci-stage.mjs --serve ${sitePort}`,
      url: `http://localhost:${sitePort}/`,
      reuseExistingServer,
    },
  ],
  projects: [
    { name: 'chromium', testIgnore: siteSpecs, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      testIgnore: siteSpecs,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'site',
      testMatch: [siteSpecs, /\/budgets\.spec\.ts$/], // budgets.spec.ts gates the root site's pages here
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${sitePort}` },
    },
  ],
});
