// C-055: the task surface every area promises, read from `task --list-all`.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url).pathname;

interface Listed {
  name: string;
  aliases: string[];
}
const listed = (
  JSON.parse(execFileSync('task', ['--list-all', '--json'], { cwd: root, encoding: 'utf8' })) as { tasks: Listed[] }
).tasks;
const names = new Set(listed.flatMap((t) => [t.name, ...t.aliases]));

const AREAS = ['theme', 'site', 'deploy', 'bunny'];
const BUNNY = ['plan', 'apply', 'zone:apply', 'verify', 'onboard', 'purge', 'gc', 'old-urls', 'cutover-verify'];

describe('task --list-all (C-055)', () => {
  it.each(AREAS.flatMap((a) => [`${a}:dev`, `${a}:test`]))('lists %s', (task) => {
    expect(names).toContain(task);
  });

  it.each(BUNNY.map((t) => `bunny:${t}`))('lists %s', (task) => {
    expect(names).toContain(task);
  });

  it('keeps the root gates and the owner-local cutover alias', () => {
    for (const t of ['check', 'e2e', 'lighthouse', 'pack', 'visual', 'secrets', 'cutover:verify']) {
      expect(names).toContain(t);
    }
  });

  it('has no lore area: it is dropped', () => {
    expect([...names].filter((n) => n.startsWith('lore:'))).toEqual([]);
  });
});
