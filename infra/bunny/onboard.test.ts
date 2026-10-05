// bunny:onboard against the fake API and a fake `gh` on PATH: the storage key travels on gh's stdin only,
// a missing `gh` or environment ends the run before any Bunny request, and a re-run changes nothing.
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SITES, previewZone, secretName } from '../../scripts/previews/sites.mjs';
import { fakeApi, type FakeApi } from './fake-api.ts';
import { main } from './onboard.mjs';

const KEY = 'fake-account-key-0123456789';
const STORED = {
  Id: 7,
  Name: 'sh-ocx-website',
  Password: 'storage-password-xyz',
  Custom404FilePath: '/bunnycdn_errors/404.html',
};

// The storage-zone fields (`Id`, `Name`, `Password`, `Custom404FilePath`) are on the M0 recording
// (fixtures/p1-storagezone.json). ponytail: the `gh api` environment body (`deployment_branch_policy`: an object, or
// null without a policy) is the documented shape, not recorded.
const GH = `#!${process.execPath}
const fs = require('fs');
const crypto = require('crypto');
const args = process.argv.slice(2);
const rec = { argv: args, accountKeyInEnv: 'BUNNY_API_KEY' in process.env };
if (args[0] === 'api') {
  fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(rec) + '\\n');
  if (!(process.env.FAKE_GH_ENVS || '').split(',').includes(args[1].split('/').pop())) process.exit(1);
  const policy = process.env.FAKE_GH_NO_POLICY ? null : { protected_branches: false, custom_branch_policies: true };
  process.stdout.write(JSON.stringify({ name: args[1].split('/').pop(), deployment_branch_policy: policy }));
  process.exit(0);
}
const input = fs.readFileSync(0);
rec.stdinSha = crypto.createHash('sha256').update(input).digest('hex');
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(rec) + '\\n');
if (process.env.FAKE_GH_FAIL) {
  process.stderr.write('HTTP 403 for body ' + input.toString() + '\\n');
  process.exit(1);
}
`;

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

let api: FakeApi | undefined;
let dir = '';
afterEach(async () => {
  await api?.close();
  api = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

interface Call {
  argv: string[];
  accountKeyInEnv: boolean;
  stdinSha?: string;
}

interface Setup {
  argv?: string[];
  env?: Record<string, string>;
  /** environments the fake `gh` reports as existing */
  ghEnvs?: string[];
  /** `false`: PATH holds no `gh` at all */
  gh?: boolean;
  ghFail?: boolean;
  /** the environments exist but have no deployment branch policy (`deployment_branch_policy: null`) */
  noPolicy?: boolean;
  storageZones?: (typeof STORED)[];
  fail?: Parameters<FakeApi['fail']>;
}

async function run(setup: Setup = {}) {
  dir = dir || mkdtempSync(join(tmpdir(), 'onboard-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  if (setup.gh !== false) {
    writeFileSync(join(bin, 'gh'), GH);
    chmodSync(join(bin, 'gh'), 0o755);
  }
  const log = join(dir, 'gh.log');
  rmSync(log, { force: true });
  api = api ?? (await fakeApi({ key: KEY, storageZones: setup.storageZones ?? [] }));
  if (setup.fail) api.fail(...setup.fail);
  const before = api.requests.length;
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({
    argv: setup.argv ?? [],
    env: {
      // no node on PATH is fine: the fake `gh` names the interpreter by absolute path
      PATH: setup.gh === false ? bin : `${bin}:${process.env.PATH ?? ''}`,
      FAKE_GH_LOG: log,
      FAKE_GH_ENVS: (setup.ghEnvs ?? ['ocx.sh', 'previews']).join(','),
      ...(setup.ghFail ? { FAKE_GH_FAIL: '1' } : {}),
      ...(setup.noPolicy ? { FAKE_GH_NO_POLICY: '1' } : {}),
      BUNNY_API_KEY: KEY,
      ...setup.env,
    },
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    baseUrl: api.url,
  });
  let raw = '';
  try {
    raw = readFileSync(log, 'utf8');
  } catch {
    // gh never ran
  }
  const calls = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Call);
  return { code, calls, out: out.join(''), err: err.join(''), requests: api.requests.slice(before), fake: api };
}

/** Every file under `root`, concatenated. */
function filesText(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .map((e) => (e.isDirectory() ? filesText(join(root, e.name)) : readFileSync(join(root, e.name), 'utf8')))
    .join('\n');
}

const secretSets = (calls: Call[]) => calls.filter((c) => c.argv[0] === 'secret');

describe('bunny:onboard', () => {
  it('creates sh-ocx-website, sets its 404 path and pipes the password to gh on stdin only', async () => {
    const r = await run();
    expect(r.code).toBe(0);
    const zone = r.fake.state.storageZones.find((z) => z.Name === 'sh-ocx-website');
    expect(zone?.Custom404FilePath).toBe('/bunnycdn_errors/404.html');
    expect(r.requests.find((q) => q.method === 'POST' && q.path === '/storagezone')?.body).toMatchObject({
      Name: 'sh-ocx-website',
      Region: 'DE',
      ReplicationRegions: [],
    });

    expect(r.calls.map((c) => c.argv)).toEqual([
      ['api', 'repos/ocx-sh/website/environments/ocx.sh'],
      ['secret', 'set', 'BUNNY_STORAGE_KEY', '--env', 'ocx.sh', '--repo', 'ocx-sh/website'],
    ]);
    const password = zone!.Password;
    expect(secretSets(r.calls)[0]?.stdinSha).toBe(sha(password));

    // Neither the storage password nor the account key reaches argv, stdout, stderr, gh's env or a file.
    for (const secret of [password, KEY]) {
      expect(JSON.stringify(r.calls.map((c) => c.argv))).not.toContain(secret);
      expect(r.out + r.err).not.toContain(secret);
      expect(filesText(dir)).not.toContain(secret);
    }
    expect(r.calls.every((c) => !c.accountKeyInEnv)).toBe(true);
  });

  it('is idempotent: a re-run creates nothing, writes nothing to Bunny and sets the same secret', async () => {
    const first = await run();
    const second = await run();
    expect(second.code).toBe(0);
    expect(second.requests.map((q) => `${q.method} ${q.path}`)).toEqual(['GET /storagezone']);
    expect(second.fake.state.storageZones).toHaveLength(1);
    expect(secretSets(second.calls)[0]?.stdinSha).toBe(secretSets(first.calls)[0]?.stdinSha);
  });

  it('names a section repo zone and sets the secret in that repo', async () => {
    const r = await run({ argv: ['ocx-sh/rules_ocx'] });
    expect(r.code).toBe(0);
    expect(r.fake.state.storageZones.map((z) => z.Name)).toEqual(['sh-ocx-rules-ocx']);
    expect(secretSets(r.calls)[0]?.argv).toEqual([
      'secret',
      'set',
      'BUNNY_STORAGE_KEY',
      '--env',
      'ocx.sh',
      '--repo',
      'ocx-sh/rules_ocx',
    ]);
  });

  it('adopts an existing zone that already has its 404 path without a write', async () => {
    const r = await run({ storageZones: [{ ...STORED }] });
    expect(r.code).toBe(0);
    expect(r.requests.map((q) => `${q.method} ${q.path}`)).toEqual(['GET /storagezone']);
    expect(secretSets(r.calls)[0]?.stdinSha).toBe(sha(STORED.Password));
  });

  it('refuses a repo that owns no claim before gh and Bunny', async () => {
    const r = await run({ argv: ['ocx-sh/nothing'] });
    expect(r.code).toBe(1);
    expect(r.err).toContain('owns no claim');
    expect(r.requests).toEqual([]);
    expect(r.calls).toEqual([]);
  });

  it('exits 1 with zero Bunny requests when the environment is missing, naming the command that creates it', async () => {
    const r = await run({ ghEnvs: [] });
    expect(r.code).toBe(1);
    expect(r.err).toContain('gh api -X PUT repos/ocx-sh/website/environments/ocx.sh');
    expect(r.requests).toEqual([]);
    expect(secretSets(r.calls)).toEqual([]);
  });

  it.each([[[]], [['--preview', 'ocx']]])(
    'refuses an environment without a deployment branch policy: exit 1, zero Bunny requests, no secret (%j)',
    async (argv) => {
      const r = await run({ argv, noPolicy: true });
      const environment = argv.length > 0 ? 'previews' : 'ocx.sh';
      expect(r.code).toBe(1);
      expect(r.requests).toEqual([]);
      expect(secretSets(r.calls)).toEqual([]);
      expect(r.err).toContain(`environment "${environment}" of ocx-sh/website has no deployment branch policy`);
      expect(r.err).toContain(
        `gh api -X PUT repos/ocx-sh/website/environments/${environment} -F 'deployment_branch_policy[protected_branches]=false' -F 'deployment_branch_policy[custom_branch_policies]=true'`,
      );
      expect(r.err).toContain('deployment-branches -f name=main -f type=branch');
    },
  );

  it('exits 1 with zero Bunny requests when gh is not installed', async () => {
    const r = await run({ gh: false });
    expect(r.code).toBe(1);
    expect(r.err).toContain('gh');
    expect(r.requests).toEqual([]);
  });

  it('refuses under CI and with an empty key before any gh call or request', async () => {
    for (const env of [{ CI: '1' }, { BUNNY_API_KEY: '' }]) {
      const r = await run({ env });
      expect(r.code).toBe(1);
      expect(r.requests).toEqual([]);
      expect(r.calls).toEqual([]);
    }
  });

  it('exits 1 on a wrong account key (401) and sets no secret', async () => {
    const r = await run({ env: { BUNNY_API_KEY: 'wrong-key' } });
    expect(r.code).toBe(1);
    expect(r.err).toContain('401');
    expect(secretSets(r.calls)).toEqual([]);
  });

  it('masks the password if gh echoes it in a failure', async () => {
    const r = await run({ ghFail: true });
    expect(r.code).toBe(1);
    expect(r.err).toContain('gh secret set BUNNY_STORAGE_KEY failed');
    expect(r.err).toContain('***');
    expect(r.err).not.toContain(r.fake.state.storageZones[0]!.Password);
  });

  it('--preview uses secretName(site), the preview zone name and the previews environment of this repo', async () => {
    const r = await run({ argv: ['--preview', 'rules_ocx'] });
    expect(r.code).toBe(0);
    expect(secretName('rules_ocx')).toBe('BUNNY_PREVIEW_KEY_RULES_OCX');
    expect(r.fake.state.storageZones.map((z) => z.Name)).toEqual([previewZone('rules_ocx')]);
    expect(r.calls.map((c) => c.argv)).toEqual([
      ['api', 'repos/ocx-sh/website/environments/previews'],
      ['secret', 'set', 'BUNNY_PREVIEW_KEY_RULES_OCX', '--env', 'previews', '--repo', 'ocx-sh/website'],
    ]);
  });

  it('--preview covers every site, and a missing previews environment stops it before Bunny', async () => {
    for (const site of SITES) {
      const r = await run({ argv: ['--preview', site.name] });
      expect(secretSets(r.calls).at(-1)?.argv[2]).toBe(secretName(site));
    }
    const missing = await run({ argv: ['--preview', 'ocx'], ghEnvs: ['ocx.sh'] });
    expect(missing.code).toBe(1);
    expect(missing.requests).toEqual([]);
  });

  it('exits 2 on bad arguments', async () => {
    for (const argv of [['--preview', 'nope'], ['--preview', 'ocx', 'ocx-sh/website'], ['a', 'b'], ['--bogus']]) {
      const r = await run({ argv });
      expect(r.code, argv.join(' ')).toBe(2);
      expect(r.requests).toEqual([]);
    }
  });
});
