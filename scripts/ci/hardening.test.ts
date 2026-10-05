// CI hardening (C-328, C-331, C-010): every workflow parsed, plus the files that police .github/.
import { readFileSync, readdirSync } from 'node:fs';
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

/** Secrets a job reads, other than the always-present GITHUB_TOKEN. */
const secretsRead = (job: Job) =>
  [...JSON.stringify(job).matchAll(/secrets\.(\w+)/g)].map((m) => m[1]!).filter((n) => n !== 'GITHUB_TOKEN');

describe('.github/workflows (C-328)', () => {
  it('finds the workflows it is meant to police', () => {
    expect(names).toEqual(expect.arrayContaining(['ci.yml', 'previews.yml', 'release.yml', 'site.yml']));
  });

  describe.each(names)('%s', (name) => {
    const text = read(`${dir}/${name}`);
    const wf = parse(text) as Workflow;

    it('holds no permission at the top', () => {
      expect(wf.permissions).toEqual({});
    });

    it('pins every uses: but a local path to a 40-hex SHA with a version comment', () => {
      const lines = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map((m) => m[1]!.trim());
      expect(lines.length).toBeGreaterThan(0);
      const unpinned = lines.filter((l) => !l.startsWith('./') && !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d\S*$/.test(l));
      expect(unpinned).toEqual([]);
    });

    it('never persists the checkout credentials', () => {
      const checkouts = Object.values(wf.jobs).flatMap((j) =>
        (j.steps ?? []).filter((s) => s.uses?.startsWith('actions/checkout@')),
      );
      expect(checkouts.filter((s) => s.with?.['persist-credentials'] !== false)).toEqual([]);
    });

    it('gives every job that reads a secret an environment', () => {
      const bare = Object.entries(wf.jobs).filter(([, j]) => secretsRead(j).length > 0 && !j.environment);
      expect(bare.map(([id]) => id)).toEqual([]);
    });
  });

  it('ci.yml keeps the gate matrix and adds zizmor and secrets jobs', () => {
    const { jobs } = parse(read(`${dir}/ci.yml`)) as Workflow;
    expect(jobs.gate?.strategy?.matrix?.gate).toEqual(['check', 'e2e', 'lighthouse', 'pack']);
    expect(jobs.zizmor?.steps?.some((s) => s.uses?.startsWith('zizmorcore/zizmor-action@'))).toBe(true);
    expect(jobs.secrets?.steps?.some((s) => s.run === 'ocx exec -- task secrets')).toBe(true);
  });

  it('runs zizmor with the repo config', () => {
    const { jobs } = parse(read(`${dir}/ci.yml`)) as Workflow;
    const step = jobs.zizmor?.steps?.find((s) => s.uses?.startsWith('zizmorcore/'));
    expect(step?.with?.config).toBe('.github/zizmor.yml');
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

describe('.github/dependabot.yml (C-331)', () => {
  const { updates } = parse(read('.github/dependabot.yml')) as {
    updates: { 'package-ecosystem': string; directory: string; cooldown: { 'default-days': number } }[];
  };

  it('covers npm at the root and github-actions, each with a 7-day cooldown', () => {
    expect(updates.map((u) => [u['package-ecosystem'], u.directory, u.cooldown['default-days']])).toEqual([
      ['npm', '/', 7],
      ['github-actions', '/', 7],
    ]);
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
