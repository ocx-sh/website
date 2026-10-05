// C-055 (bunny:dev / bunny:test listed) and C-318 (dotenv only where the account key is read).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url).pathname;
const SOURCE = readFileSync(`${ROOT}taskfiles/bunny.yml`, 'utf8');

/** Every task of bunny.yml with its own `dotenv:` value, read from the committed two-space layout. */
function parseTasks(text: string): { top: string[]; tasks: Map<string, string | null> } {
  const top: string[] = [];
  const tasks = new Map<string, string | null>();
  let inTasks = false;
  let current: string | null = null;
  for (const line of text.split('\n')) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const key = /^(\S[^:]*):/.exec(line);
    if (key) {
      const topKey = key[1] ?? '';
      top.push(topKey);
      inTasks = topKey === 'tasks';
      current = null;
      continue;
    }
    if (!inTasks) continue;
    const name = /^ {2}(\S.*):\s*$/.exec(line);
    if (name) {
      current = (name[1] ?? '').replace(/^['"]|['"]$/g, '');
      tasks.set(current, null);
      continue;
    }
    const dotenv = /^ {4}dotenv:\s*(.*)$/.exec(line);
    if (dotenv && current) tasks.set(current, (dotenv[1] ?? '').trim());
  }
  return { top, tasks };
}

const { top, tasks } = parseTasks(SOURCE);

const WITH_KEY = ['apply', 'zone:apply', 'onboard', 'purge', 'gc'];
const WITHOUT_KEY = ['test', 'plan', 'verify', 'old-urls', 'cutover-verify'];

describe('taskfiles/bunny.yml', () => {
  it('has no top-level dotenv (Task 3.53.1 rejects it in an included Taskfile)', () => {
    expect(top).toContain('tasks');
    expect(top).not.toContain('dotenv');
  });

  it('pre-declares every bunny:* target of the pipeline table', () => {
    expect([...tasks.keys()].sort()).toEqual([...WITH_KEY, ...WITHOUT_KEY, 'dev'].sort());
  });

  it.each(WITH_KEY)("%s carries a task-level dotenv: ['.env']", (name) => {
    expect(tasks.get(name)).toBe("['.env']");
  });

  it.each(WITHOUT_KEY)('%s reads no .env', (name) => {
    expect(tasks.get(name)).toBeNull();
  });

  it('dev reads no .env either', () => {
    expect(tasks.get('dev')).toBeNull();
  });
});

describe('task --list-all', () => {
  const listed = (): string[] =>
    (
      JSON.parse(execFileSync('task', ['--list-all', '--json'], { cwd: ROOT, encoding: 'utf8' })) as {
        tasks: { name: string }[];
      }
    ).tasks.map((t) => t.name);

  it('lists bunny:dev and bunny:test, and the included file loads', () => {
    const names = listed();
    expect(names).toContain('bunny:dev');
    expect(names).toContain('bunny:test');
    expect(names).toContain('bunny:zone:apply');
  });
});

describe('.gitignore', () => {
  const ignored = (path: string): boolean => {
    try {
      execFileSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: ROOT });
      return true;
    } catch {
      return false;
    }
  };

  it('covers .env and .env.* except .env.example', () => {
    expect(ignored('.env')).toBe(true);
    expect(ignored('.env.local')).toBe(true);
    expect(ignored('.env.production')).toBe(true);
    expect(ignored('.env.example')).toBe(false);
  });
});

describe('.env.example', () => {
  it('names the account key with an empty value and holds no secret', () => {
    const lines = readFileSync(`${ROOT}.env.example`, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '' && !l.startsWith('#'));
    expect(lines).toContain('BUNNY_API_KEY=');
    for (const l of lines) expect(l).toMatch(/^[A-Z][A-Z0-9_]*=$/);
  });
});
