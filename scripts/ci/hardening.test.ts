// CI hardening (C-328, C-331, C-010): every workflow parsed, plus the files that police .github/.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const dir = '.github/workflows';
const names = readdirSync(join(root, dir)).filter((f) => /\.ya?ml$/.test(f));

interface Step {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Job {
  uses?: string;
  environment?: unknown;
  strategy?: { matrix?: { gate?: string[] } };
  steps?: Step[];
}
interface Workflow {
  permissions?: unknown;
  jobs: Record<string, Job>;
}

/** `uses:` values of a workflow; none for one that runs only gh and jq, like lighthouse-comment.yml. */
const usesOf = (text: string) => [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map((m) => m[1]!.trim());

/** Secrets a job reads, other than the always-present GITHUB_TOKEN. */
const secretsRead = (job: Job) =>
  [...JSON.stringify(job).matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!).filter((n) => n !== 'GITHUB_TOKEN');

describe('.github/workflows (C-328)', () => {
  it('finds the workflows it is meant to police', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'claude.yml',
        'previews.yml',
        'release.yml',
        'site.yml',
        'verify-basic.yml',
        'verify-deep.yml',
      ]),
    );
  });

  it('finds uses: lines at all, so the per-workflow pin check is not vacuous', () => {
    expect(names.flatMap((n) => usesOf(read(`${dir}/${n}`))).length).toBeGreaterThan(0);
  });

  describe.each(names)('%s', (name) => {
    const text = read(`${dir}/${name}`);
    const wf = parse(text) as Workflow;

    it('holds no permission at the top', () => {
      expect(wf.permissions).toEqual({});
    });

    it('pins every uses: but a local path to a 40-hex SHA with a version comment', () => {
      const lines = usesOf(text);
      const unpinned = lines.filter((l) => !l.startsWith('./') && !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d\S*$/.test(l));
      expect(unpinned).toEqual([]);
    });

    it('never persists the checkout credentials', () => {
      const checkouts = Object.values(wf.jobs).flatMap((j) =>
        (j.steps ?? []).filter((s) => s.uses?.startsWith('actions/checkout@')),
      );
      expect(checkouts.filter((s) => s.with?.['persist-credentials'] !== false)).toEqual([]);
    });

    // The template-owned workflows read org secrets (BAZEL_CACHE_*, OTEL_OTLP_AUTH, CLAUDE_CODE_OAUTH_TOKEN)
    // and use no environment; every other workflow's secrets stay behind one.
    const orgSecretWorkflows = ['claude.yml', 'verify-basic.yml', 'verify-deep.yml'];
    it(
      orgSecretWorkflows.includes(name)
        ? 'reads org secrets and uses no environment'
        : 'gives every job that reads a secret an environment',
      () => {
        const bare = Object.entries(wf.jobs).filter(([, j]) =>
          orgSecretWorkflows.includes(name) ? !!j.environment : secretsRead(j).length > 0 && !j.environment,
        );
        expect(bare.map(([id]) => id)).toEqual([]);
      },
    );
  });

  it('verify-basic maps every CI tier onto its task', () => {
    const { jobs } = parse(read(`${dir}/verify-basic.yml`)) as Workflow;
    const runs = (job: string) => (jobs[job]?.steps ?? []).map((s) => s.run?.trim());
    expect(runs('lint')).toEqual(
      expect.arrayContaining(['task ci:lint', 'task lock:check', 'task baseline:check', 'task secrets']),
    );
    expect(runs('lint').some((r) => r?.includes('task workflows:lint'))).toBe(true);
    expect(runs('test')).toContain('task ci:test');
    expect(runs('docs')).toContain('task ci:docs');
    expect(jobs['basic-gate']).toBeDefined();
  });

  it('verify-deep runs the e2e and pack tier', () => {
    const { jobs } = parse(read(`${dir}/verify-deep.yml`)) as Workflow;
    expect(jobs.deep?.steps?.some((s) => s.run === 'task ci:deep')).toBe(true);
  });

  it('runs zizmor with the repo config through workflows:lint', () => {
    expect(read('taskfiles/baseline.taskfile.yml')).toMatch(/zizmor .*--config \.github\/zizmor\.yml/);
  });
});

describe('.github/zizmor.yml', () => {
  const cfg = parse(read('.github/zizmor.yml')) as {
    rules: Record<string, { disable?: boolean; config?: { policies: Record<string, string> } }>;
  };

  it('makes ocx-sh/* hash-pinned', () => {
    expect(cfg.rules['unpinned-uses']?.config?.policies['ocx-sh/*']).toBe('hash-pin');
  });

  it('disables only self-repository', () => {
    expect(Object.keys(cfg.rules).filter((r) => cfg.rules[r]?.disable)).toEqual(['self-repository']);
  });
});

describe('renovate.json (C-331)', () => {
  const cfg = parse(read('renovate.json')) as { extends?: string[] };

  // The 7-day dependency cooldown (minimumReleaseAge) lives in the conventions preset, not here:
  // extending it is what carries the cooldown, so this file needs no assertion of its own.
  // copier pins the preset to the baseline release tag, or to a commit between releases.
  it('extends the shared conventions preset, pinned to a release tag or commit', () => {
    expect(cfg.extends).toEqual([
      expect.stringMatching(/^github>ocx-sh\/conventions\/\/renovate\/default#(v\d+\.\d+\.\d+|[0-9a-f]{40})$/),
    ]);
  });

  it('replaces Dependabot', () => {
    expect(existsSync(join(root, '.github/dependabot.yml'))).toBe(false);
  });
});

describe('.github/CODEOWNERS (C-010, C-331)', () => {
  const rules = read('.github/CODEOWNERS')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));

  it('assigns nav.json, legacy.json, the workflows and Bunny as code to an owner', () => {
    expect(rules.map(([path]) => path)).toEqual([
      '/packages/theme/src/nav.json',
      '/infra/bunny/legacy.json',
      '/.github/',
      '/infra/bunny/',
    ]);
    expect(rules.every(([, ...owners]) => owners.length > 0 && owners.every((o) => o.startsWith('@')))).toBe(true);
  });
});
