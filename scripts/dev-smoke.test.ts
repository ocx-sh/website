// C-059 / S-001: the example's `astro dev` serves /docs/ wearing the .ocx-header
// and reflects an edit to packages/theme/src/** without a restart.
// Opt-in (OCX_DEV_SMOKE=1): it spawns a server and edits a source file, so it
// must never run inside `task check`, nor alongside the Container API tests.
import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const example = new URL('../examples/starlight/', import.meta.url).pathname;
const astro = new URL('../examples/starlight/node_modules/astro/bin/astro.mjs', import.meta.url).pathname;
const header = new URL('../packages/theme/src/starlight/Header.astro', import.meta.url).pathname;
const READY_MS = 60_000;
const RELOAD_MS = 5_000; // S-001 targets < 2 s; the gate allows headroom for a cold WSL disk.

/** A free TCP port other than 4321 (the owner's live `task dev`). */
async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const address = srv.address();
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  if (address === null || typeof address === 'string' || address.port === 4321) throw new Error('no usable free port');
  return address.port;
}

/** Polls `url` until `ok(body)` holds; resolves with the elapsed ms, rejects after `timeoutMs`. */
async function waitFor(url: string, ok: (body: string) => boolean, timeoutMs: number): Promise<number> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok && ok(await res.text())) return performance.now() - start;
    } catch {
      // Server not up yet, or a request aborted mid-reload: poll again.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${url}`);
}

describe.skipIf(!process.env.OCX_DEV_SMOKE)('C-059 dev server', () => {
  let server: ChildProcess | undefined;
  let url = '';

  beforeAll(async () => {
    const port = await freePort();
    url = `http://127.0.0.1:${port}/docs/`;
    // Vitest's NODE_ENV=test / VITEST* make astro dev answer 404 for every page.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'NODE_ENV' && !k.startsWith('VITEST')),
    );
    // --ignore-lock: coexist with the owner's server and stay in the foreground
    // (astro otherwise auto-backgrounds under a detected AI agent, and kill() would miss it).
    server = spawn(process.execPath, [astro, 'dev', '--ignore-lock', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: example,
      stdio: 'ignore',
      env: { ...env, ASTRO_TELEMETRY_DISABLED: '1' },
    });
    await waitFor(url, () => true, READY_MS);
  }, READY_MS + 5_000);

  afterAll(() => {
    server?.kill('SIGTERM');
  });

  it('C-059: serves /docs/ with the .ocx-header markup', async () => {
    const html = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).text();
    expect(html).toMatch(/class="ocx-header[" ]/);
  });

  it(
    'C-059/S-001: an edit under packages/theme/src/** is served without a restart',
    async () => {
      const original = readFileSync(header, 'utf8');
      const marker = `data-ocx-smoke="${randomBytes(4).toString('hex')}"`;
      const edited = original.replace('<div class="ocx-header"', `<div class="ocx-header" ${marker}`);
      expect(edited).not.toBe(original);
      try {
        writeFileSync(header, edited);
        const elapsed = await waitFor(url, (body) => body.includes(marker), RELOAD_MS);
        expect(elapsed).toBeLessThan(RELOAD_MS);
      } finally {
        writeFileSync(header, original);
      }
    },
    RELOAD_MS + 15_000,
  );
});
