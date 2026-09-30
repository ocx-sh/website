import { defineConfig, devices } from '@playwright/test';

// Serves the built example under /docs/ via `astro preview` (no extra static-server dep).
// --ignore-lock: keeps Astro 7 from auto-backgrounding the server in agent shells.
// Port 4322 (override: E2E_PORT) so a running `task dev` on 4321 is never reused as the target.
// A server already on the port is reused only with E2E_REUSE=1: a leftover preview or another
// project's dev server there would otherwise be tested silently.
// ponytail: site/dist at / gets its own webServer entry once WP8 lands site/.
const port = process.env['E2E_PORT'] ?? '4322';

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env['CI'],
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm --dir examples/starlight exec astro preview --ignore-lock --port ${port}`,
    url: `http://localhost:${port}/docs/`,
    reuseExistingServer: process.env['E2E_REUSE'] === '1',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
