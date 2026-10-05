// The two deploy workflows, parsed (not grepped), plus the secrets rule that holds for every file under .github/.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { SITES, secretName } from '../previews/sites.mjs';

const root = join(import.meta.dirname, '..', '..');
const github = join(root, '.github');
const ACTION = './.github/actions/deploy';

interface Step {
  id?: string;
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}
interface Job {
  if?: string;
  needs?: string;
  environment?: string | { name: string; url?: string };
  'timeout-minutes'?: number;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  permissions?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const workflow = (name: string) => parse(read(`.github/workflows/${name}`)) as Workflow;
/** A step or job `if:` without its optional `${{ }}` wrapper. */
const cond = (v: string | undefined) => v?.replace(/^\$\{\{\s*|\s*\}\}$/g, '');
const envName = (job: Job) => (typeof job.environment === 'string' ? job.environment : job.environment?.name);
const deploySteps = (job: Job) => job.steps.filter((s) => s.uses === ACTION);

/** Every file under a directory, recursively. */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('site.yml', () => {
  const wf = workflow('site.yml');
  const { build, deploy } = wf.jobs;

  it('triggers on main pushes of the site inputs, a daily schedule and dispatch, nothing else', () => {
    expect(Object.keys(wf.on).sort()).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(wf.on.push).toEqual({
      branches: ['main'],
      paths: ['site/**', 'packages/theme/**', 'infra/bunny/legacy.json', 'pnpm-lock.yaml'],
    });
    expect(wf.on.schedule).toHaveLength(1);
  });

  it('holds no permission at the top, contents: read in the build job, none in the deploy job', () => {
    expect(wf.permissions).toEqual({});
    expect(build?.permissions).toEqual({ contents: 'read' });
    expect(deploy?.permissions).toEqual({});
  });

  it('builds site/ and uploads site/dist', () => {
    const upload = build?.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.with?.path).toBe('site/dist');
    expect(build?.steps.some((s) => /\bsite\b.*\bbuild\b/.test(s.run ?? ''))).toBe(true);
  });

  it('skips (never fails) the deploy job before BUNNY_DEPLOY is set, and off main', () => {
    expect(cond(deploy?.if)).toBe("github.ref == 'refs/heads/main' && vars.BUNNY_DEPLOY == 'true'");
    expect(deploy?.needs).toBe('build');
  });

  it('serialises deploys without cancelling one, in the ocx.sh environment', () => {
    expect(deploy?.concurrency).toEqual({ group: 'deploy-root', 'cancel-in-progress': false });
    expect(envName(deploy!)).toBe('ocx.sh');
  });

  it('calls the local deploy action once, with the zone key and only declared inputs', () => {
    const steps = deploySteps(deploy!);
    expect(steps).toHaveLength(1);
    const declared = Object.keys((parse(read('.github/actions/deploy/action.yml')) as { inputs: object }).inputs);
    const given = Object.keys(steps[0]!.with ?? {});
    expect(given.every((k) => declared.includes(k))).toBe(true);
    expect(steps[0]!.with?.['storage-key']).toBe('${{ secrets.BUNNY_STORAGE_KEY }}');
    expect(given).not.toContain('preview');
  });

  it('times the deploy job out', () => {
    expect(deploy?.['timeout-minutes']).toBe(20);
  });
});

describe('previews.yml', () => {
  const wf = workflow('previews.yml');
  const { previews, deploy } = wf.jobs;
  const steps = deploySteps(deploy!);

  it('builds without secrets and deploys from a job in the previews environment', () => {
    expect(wf.permissions).toEqual({});
    expect(envName(previews!)).toBeUndefined();
    expect(envName(deploy!)).toBe('previews');
    expect(deploy?.needs).toBe('previews');
    expect(deploy?.permissions).toEqual({});
  });

  it('gates the deploy job on PREVIEWS_DEPLOY and main', () => {
    expect(cond(deploy?.if)).toBe("vars.PREVIEWS_DEPLOY == 'true' && github.ref == 'refs/heads/main'");
  });

  it('has one deploy step per site, in sites.mjs order', () => {
    expect(steps.map((s) => s.with?.preview)).toEqual(SITES.map((s) => s.name));
  });

  it.each(SITES)('$name: its own secret, its dist and the inputs.site condition', (site) => {
    const step = steps.find((s) => s.with?.preview === site.name)!;
    expect(step.with?.['storage-key']).toBe(`\${{ secrets.${secretName(site)} }}`);
    expect(step.with?.dist).toBe(`previews/${site.name}/dist`);
    expect(cond(step.if)).toBe(`steps.site.outputs.name == '' || steps.site.outputs.name == '${site.name}'`);
  });

  it('times the deploy job out', () => {
    expect(deploy?.['timeout-minutes']).toBe(20);
  });

  it('resolves inputs.site once, through env, before any deploy step', () => {
    const resolve = deploy!.steps.find((s) => s.id === 'site')!;
    expect(resolve.run).toContain('scripts/previews/resolve-site.mjs');
    expect(resolve.env?.SITE).toBe('${{ inputs.site }}');
    expect(deploy!.steps.indexOf(resolve)).toBeLessThan(deploy!.steps.indexOf(steps[0]!));
    for (const s of deploy!.steps) expect(s.run ?? '').not.toContain('${{ inputs');
  });

  it('never indexes secrets dynamically', () => {
    const text = read('.github/workflows/previews.yml');
    expect(text).not.toMatch(/secrets\s*\[/);
    expect(text).not.toMatch(/toJSON\(\s*secrets/i);
    expect(text).not.toMatch(/\bsecrets:\s*inherit\b/);
  });
});

describe('scripts/previews/resolve-site.mjs', () => {
  const resolve = (arg: string) =>
    spawnSync(process.execPath, ['scripts/previews/resolve-site.mjs', arg], { cwd: root, encoding: 'utf8' });

  it('prints the name for a name or a slug, and nothing for an empty input', () => {
    expect(resolve('rules_ocx').stdout).toBe('rules_ocx');
    expect(resolve('rules-ocx').stdout).toBe('rules_ocx');
    expect(resolve('')).toMatchObject({ status: 0, stdout: '' });
  });

  it('exits 1 for a site that matches none, so the dispatch fails instead of skipping every deploy', () => {
    const out = resolve('nope');
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('unknown preview site');
  });
});

describe('.github/ secrets rule', () => {
  it('no file mentions the account-wide Bunny key', () => {
    const hits = files(github).filter((f) => readFileSync(f, 'utf8').includes('BUNNY_API_KEY'));
    expect(hits).toEqual([]);
  });
});
