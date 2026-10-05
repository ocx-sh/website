// C-324: release.yml and RELEASING.md. A stable tag publishes npm and the skills; no Git tag floats.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

interface Step {
  name?: string;
  uses?: string;
  run?: string;
}
interface Job {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  strategy?: { matrix?: { gate?: string[] } };
  steps: Step[];
}
interface Workflow {
  on: { push: { tags: string[] }; [trigger: string]: unknown };
  jobs: Record<string, Job>;
}

const wf = parse(read('.github/workflows/release.yml')) as Workflow;
const { verify, gate, npm, skills } = wf.jobs;
const runs = (job: Job | undefined) => (job?.steps ?? []).map((s) => s.run ?? '').join('\n');

describe('release.yml (C-324)', () => {
  it('triggers on stable tags only, nothing else', () => {
    expect(Object.keys(wf.on)).toEqual(['push']);
    expect(wf.on.push).toEqual({ tags: ['v[0-9]+.[0-9]+.[0-9]+'] });
  });

  it('verifies that the tag equals the package version and sits on main', () => {
    const script = runs(verify);
    expect(script).toContain('packages/theme/package.json');
    expect(script).toMatch(/"v\$\{version\}" != "\$TAG"/);
    expect(script).toContain('merge-base --is-ancestor "$GITHUB_SHA" origin/main');
  });

  it('gates on check and pack after verify, and every publisher waits for the gate', () => {
    expect(gate?.needs).toBe('verify');
    expect(gate?.strategy?.matrix?.gate).toEqual(['check', 'pack']);
    expect(npm?.needs).toBe('gate');
    expect(skills?.needs).toBe('gate');
  });

  it('publishes npm with provenance, through OIDC, and skips a version already on npm', () => {
    expect(npm?.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    const script = runs(npm);
    expect(script).toMatch(/npm view "@ocx-sh\/theme@\$\{TAG#v\}" version/);
    expect(script).toContain('exit 0');
    expect(script).toContain('npm publish --provenance --access public');
    expect(script.indexOf('npm view')).toBeLessThan(script.indexOf('npm publish'));
  });

  it('holds no npm token and grants id-token to the npm job alone', () => {
    expect(JSON.stringify(wf.jobs)).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/);
    const withOidc = Object.entries(wf.jobs).filter(([, j]) => j.permissions?.['id-token'] === 'write');
    expect(withOidc.map(([id]) => id)).toEqual(['npm']);
  });

  it('publishes the grim skills at the tag version', () => {
    expect(runs(skills)).toContain('grim publish --version "$TAG"');
    expect(skills?.permissions).toEqual({ contents: 'read', packages: 'write' });
  });

  it('runs only on the canonical repository', () => {
    for (const job of [verify, npm, skills, wf.jobs['github-release']]) {
      expect(job?.if).toBe("github.repository == 'ocx-sh/website'");
    }
  });

  it('skips a GitHub release that already exists', () => {
    expect(runs(wf.jobs['github-release'])).toMatch(/gh release view "\$TAG"[\s\S]*exit 0/);
  });
});

describe('no floating tag (C-324)', () => {
  const dir = join(root, '.github/workflows');
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

  it.each(files)('%s never creates, moves or pushes a Git tag', (name) => {
    const w = parse(read(`.github/workflows/${name}`)) as Workflow;
    const script = Object.values(w.jobs).map(runs).join('\n');
    expect(script).not.toMatch(/git\s+(tag|push|update-ref)|refs\/tags|--force-with-lease/);
    // A major-only tag such as v1: the `^v[0-9]+$` shape.
    expect(script).not.toMatch(/(^|[\s"'/])v[0-9]+(?![\w.])/m);
  });
});

describe('RELEASING.md (C-324, S-122)', () => {
  const text = read('RELEASING.md');
  const flat = text.replace(/\s+/g, ' ');

  it('declares the page as a runbook', () => {
    expect(text.split('\n').slice(0, 12).join('\n')).toContain('<!-- doc_type: runbook -->');
  });

  it('records v0.1.0 as the first release, by hand, then tag-driven', () => {
    expect(flat).toMatch(/`v0\.1\.0`[^.]*by hand/i);
    expect(flat).toContain('trusted publisher');
    expect(flat).toContain('The workflow skips npm (the version exists)');
  });

  it('says there is no floating tag and consumers pin SHAs', () => {
    expect(flat).toMatch(/no floating (Git )?tag/i);
    expect(flat).toMatch(/pin (a |the )?(full )?(commit )?SHAs?/i);
  });

  it('names the ghcr Public step and the version-mismatch failure (S-122)', () => {
    expect(flat).toContain('**Public**');
    expect(flat).toMatch(/does not match|must equal/);
  });
});
