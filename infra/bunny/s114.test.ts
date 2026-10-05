// The owner brings up Bunny dev (OG-D) once, offline: onboard, zone:apply, apply, verify, each module's `main` against
// one fake API, a fake `gh` and a fake CDN host. Every step exits 0 and leaves the zone the next step expects.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main as applyMain } from './apply.mjs';
import { fakeApi, type FakeApi } from './fake-api.ts';
import { main as onboardMain } from './onboard.mjs';
import { planRules } from './rules.mjs';
import { main as verifyMain, probesFor, type Probe } from './verify.mjs';
import { main as zoneMain } from './zone.mjs';

const KEY = 'fake-account-key-0123456789';

// ponytail: the fake `gh` and the CDN replies are hand-written to the documented shapes (`gh api` exit code,
// `gh secret set` on stdin; a redirect, a `noindex` page with a canonical), not recorded; re-check against the owner's recorded responses (infra/bunny/README.md, "Record a response")
// and rerun this sequence.
const GH = `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'api') {
  process.stdout.write(JSON.stringify({ deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }));
  process.exit(0);
}
require('fs').readFileSync(0);
`;

/** What a correct dev zone answers for a probe: the golden redirect, or a `noindex` page with its canonical. */
function good(p: Probe): Response {
  const headers = { 'x-robots-tag': 'noindex, nofollow' };
  if (p.kind === 'redirect')
    return new Response(null, { status: p.status, headers: { ...headers, location: p.location! } });
  const canonical = `<link rel="canonical" href="${p.canonical ?? `https://ocx.sh${p.path}`}">`;
  return new Response(`<!doctype html><html><head><title>t</title>${canonical}</head><body>ok</body></html>`, {
    status: 200,
    headers: { ...headers, 'content-type': 'text/html' },
  });
}

let api: FakeApi | undefined;
let dir = '';
afterEach(async () => {
  await api?.close();
  api = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('S-114 Bunny dev up, offline', () => {
  it('onboard, zone:apply, apply and verify are all green, in that order', async () => {
    dir = mkdtempSync(join(tmpdir(), 's114-'));
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'bin', 'gh'), GH);
    chmodSync(join(dir, 'bin', 'gh'), 0o755);
    api = await fakeApi({ key: KEY });
    const env = { PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`, BUNNY_API_KEY: KEY };
    const baseUrl = api.url;
    const outs: string[] = [];
    const errs: string[] = [];
    const io = { out: (t: string) => outs.push(t), err: (t: string) => errs.push(t) };

    const writes = () => api!.requests.filter((q) => q.method !== 'GET').length;
    const codes = [
      await onboardMain({ argv: ['ocx-sh/website'], env, baseUrl, ...io }),
      await zoneMain({ argv: ['--zone', 'dev'], env, baseUrl, ...io }),
    ];
    const before = writes();
    codes.push(await applyMain({ argv: ['--zone', 'dev', '--dry-run'], env, baseUrl, ...io }));
    expect(writes()).toBe(before);
    codes.push(await applyMain({ argv: ['--zone', 'dev'], env, baseUrl, ...io }));

    const seen: string[] = [];
    const probes = probesFor('dev');
    const fetch: typeof globalThis.fetch = (input, init) => {
      expect(new Headers(init?.headers).has('AccessKey')).toBe(false);
      const { host, pathname } = new URL(input instanceof Request ? input.url : input);
      seen.push(`${host}${pathname}`);
      return Promise.resolve(good(probes.find((p) => p.path === pathname)!));
    };
    codes.push(await verifyMain({ argv: ['--zone', 'dev'], fetch, ...io }));

    expect(errs.join('')).toBe('');
    expect(codes).toEqual([0, 0, 0, 0, 0]);

    // the storage zone onboard made is the pull zone's origin, and the plan is live in full
    const storage = api.state.storageZones.find((z) => z.Name === 'sh-ocx-website')!;
    const pull = api.state.pullZones.find((z) => z.Name === 'sh-ocx-dev')!;
    expect(pull.StorageZoneId).toBe(storage.Id);
    expect(pull.EdgeRules).toHaveLength(planRules('dev').length);
    expect(pull.Hostnames.every((h) => h.ForceSSL === true)).toBe(true);

    // verify probed the b-cdn.net host once per planned probe
    expect(seen).toEqual(probes.map((p) => `sh-ocx-dev.b-cdn.net${p.path}`));

    // a second apply has nothing to do
    const again: string[] = [];
    expect(await applyMain({ argv: ['--zone', 'dev'], env, baseUrl, out: (t) => again.push(t), err: io.err })).toBe(0);
    expect(again.join('')).toMatch(/0 changes applied, read back equal/);
  });
});
