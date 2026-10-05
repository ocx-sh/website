// The consumer workflow template in skills/ocx-theme-deploy is what every section repo copies, so it
// must lint clean and keep the trigger and pinning contract. The test extracts it from SKILL.md.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const skillDir = join(import.meta.dirname, '..', '..', '..', '..', 'skills', 'ocx-theme-deploy');
const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const failureModes = readFileSync(join(skillDir, 'references', 'failure-modes.md'), 'utf8');

// Pinned like the lint tools in ocx.toml: zizmor has no ocx.sh package yet, so uvx fetches this version.
const ZIZMOR_VERSION = '1.30.1';

/** The first ```yaml fence of SKILL.md that holds a workflow (`name:` at column 0). */
function template(): string {
  const fences = [...skill.matchAll(/```yaml\n([\s\S]*?)\n```/g)].map((m) => m[1]!);
  const found = fences.find((f) => /^name: /m.test(f));
  if (!found) throw new Error('SKILL.md has no workflow template in a yaml fence');
  return `${found}\n`;
}

const text = template();
const dir = mkdtempSync(join(tmpdir(), 'skill-template-'));
const file = join(dir, '.github', 'workflows', 'deploy.yml');
mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
writeFileSync(file, text);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The top-level keys under `on:` (two-space indent), read without a YAML parser. */
function triggers(): string[] {
  const lines = text.split('\n');
  const start = lines.indexOf('on:');
  if (start < 0) throw new Error('template has no `on:` block');
  const keys: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line !== '' && !line.startsWith(' ')) break;
    const key = /^ {2}([\w-]+):/.exec(line)?.[1];
    if (key) keys.push(key);
  }
  return keys;
}

/** Run a lint tool; a tool that cannot start fails the test, it is never skipped. */
function lint(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: dir, timeout: 110_000 });
  if (r.error) throw new Error(`cannot run ${cmd}: ${r.error.message}; run the test under \`ocx exec --\``);
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('skills/ocx-theme-deploy workflow template', () => {
  it('has exactly the push, schedule and workflow_dispatch triggers', () => {
    expect(triggers().sort()).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(text).toMatch(/push:\n {4}branches: \[main\]/);
    expect(text).not.toMatch(/\btags:/);
  });

  it('runs the deploy job in the ocx.sh environment', () => {
    expect(text).toMatch(/environment: \{ name: ocx\.sh,/);
  });

  it('pins every uses: to a 40-hex SHA with a version comment', () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    expect(uses.some((u) => u.startsWith('ocx-sh/website/.github/actions/deploy@'))).toBe(true);
  });

  it('documents the scheduled-workflow 60-day disable in the failure modes', () => {
    expect(failureModes).toMatch(/60 days without repository activity/);
    expect(failureModes).toMatch(/gh workflow enable/);
  });

  it('documents every action input, the prune cap and preview secret naming', () => {
    const action = readFileSync(join(skillDir, '..', '..', '.github', 'actions', 'deploy', 'action.yml'), 'utf8');
    const inputs = [
      ...action.slice(action.indexOf('inputs:'), action.indexOf('outputs:')).matchAll(/^ {2}([\w-]+):/gm),
    ];
    expect(inputs.length).toBe(7);
    for (const [, name] of inputs) expect(skill).toContain(`| \`${name}\` |`);
    expect(skill).toMatch(/more than half of the listed HTML files and at\s+least 10/);
    expect(skill).toContain('BUNNY_PREVIEW_KEY_<SLUG>');
    expect(skill + failureModes).not.toMatch(/preview\.ocx\.sh|tags: \['v\*'\]/);
  });

  it('passes actionlint', () => {
    const r = lint('actionlint', [file]);
    expect(r.out).toBe('');
    expect(r.status).toBe(0);
  });

  // zizmor runs offline: its online audits (impostor commits, known-vulnerable actions) need a token and the
  // placeholder deploy SHA is not a real commit.
  it('passes zizmor', () => {
    const direct = spawnSync('zizmor', ['--version'], { encoding: 'utf8' });
    const [cmd, pre] = direct.error ? ['uvx', [`zizmor@${ZIZMOR_VERSION}`]] : ['zizmor', []];
    const r = lint(cmd, [...pre, '--offline', '--no-progress', file]);
    expect(r.out, r.out).not.toMatch(/\b(?:error|warning)\[/);
    expect(r.status, r.out).toBe(0);
  }, 120_000);
});
