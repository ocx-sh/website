// The Bunny runbook is a runbook page: a task it names must exist, and the M0, OG-D and OG-V sections the
// owner follows must not lose a probe, a step, a verify or a rollback.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('README.md', import.meta.url), 'utf8');
const taskfile = readFileSync(new URL('../../taskfiles/bunny.yml', import.meta.url), 'utf8');

/** Task names declared in bunny.yml, read from its two-space layout. */
const declared = new Set(
  [...taskfile.slice(taskfile.indexOf('\ntasks:')).matchAll(/^ {2}(['"]?)([a-z][\w:-]*)\1:\s*$/gm)].map((m) => m[2]),
);

/** The text between a `## ` heading and the next one. */
const section = (title: string) => {
  const start = readme.indexOf(`\n## ${title}`);
  expect(start, `section "${title}"`).toBeGreaterThan(-1);
  const end = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, end === -1 ? undefined : end);
};

/** Headings outside fenced blocks, with their level. */
const headings = readme
  .replace(/^```[\s\S]*?^```/gm, '')
  .split('\n')
  .flatMap((l) => {
    const m = /^(#{1,6}) (.+)$/.exec(l);
    return m ? [{ level: m[1]!.length, title: m[2]! }] : [];
  });

describe('Bunny README', () => {
  it('declares itself a runbook inside the first 12 lines', () => {
    expect(readme.split('\n').slice(0, 12)).toContain('<!-- doc_type: runbook -->');
  });

  it('has one H1 and skips no heading level', () => {
    expect(headings.filter((h) => h.level === 1)).toHaveLength(1);
    headings.slice(1).forEach((h, i) => expect(h.level, h.title).toBeLessThanOrEqual(headings[i]!.level + 1));
  });

  it('every `task bunny:*` it names exists in taskfiles/bunny.yml, and all six live tasks are named', () => {
    const named = [...readme.matchAll(/\btask (bunny:[\w:-]+)/g)].map((m) => m[1]!.replace(/^bunny:/, ''));
    expect(named.filter((n) => !declared.has(n))).toEqual([]);
    for (const task of ['onboard', 'zone:apply', 'apply', 'verify', 'purge', 'gc']) expect(named, task).toContain(task);
  });

  it('names no other task, so a rename cannot hide behind a different prefix', () => {
    const others = [...readme.matchAll(/(?:^|`)task ([a-z][\w:-]*)/gm)]
      .map((m) => m[1]!)
      .filter((n) => !n.startsWith('bunny:'));
    expect(others).toEqual([]);
  });

  it('states that CI never gets BUNNY_API_KEY', () => {
    expect(readme).toMatch(/CI never gets `BUNNY_API_KEY`/);
    expect(readme).toMatch(/exits 1 before any request when `CI` is set/);
  });

  it('names a verify and a rollback in every step', () => {
    const steps = readme.split(/^### /m).slice(1);
    expect(steps.length).toBeGreaterThan(15);
    for (const step of steps) {
      const title = step.split('\n')[0];
      expect(step, title).toMatch(/\nVerify: /);
      expect(step, title).toMatch(/\nRollback: /);
    }
  });

  describe('M0', () => {
    const m0 = section('M0: Bunny probes');

    it.each(['P1', 'P7', 'P8', 'P9'])('has a step for probe %s', (probe) => {
      expect(m0).toMatch(new RegExp(`^### ${probe}: `, 'm'));
    });

    it('says what to record and where: fixtures under infra/bunny/fixtures, outcomes in the plan M0 table', () => {
      expect(m0).toContain('.agents/plans/plan_website-buildout.md');
      for (const file of ['p1-pullzone.json', 'p1-storagezone.json', 'p7-pullzone.json', 'p8-pullzone.json'])
        expect(m0, file).toContain(file);
      expect(m0).toMatch(/infra\/bunny\/fixtures\/p1-pullzone\.json/);
      expect(m0).toMatch(/Result row/);
      expect(m0).toMatch(/Decision row/);
    });

    it('records through redact(), with no S3 zone', () => {
      expect(m0).toMatch(/\bredact\b/);
      expect(m0).toMatch(/HTTP API, not S3/);
    });
  });

  describe('OG-D', () => {
    const ogd = section('OG-D: Bunny dev up');

    it('creates the environments before the first onboard', () => {
      expect(ogd.indexOf('### Step 1: create the environments')).toBeGreaterThan(-1);
      expect(ogd.indexOf('### Step 1')).toBeLessThan(ogd.indexOf('### Step 2: onboard'));
    });

    it('runs onboard, zone:apply, apply and verify in that order', () => {
      const at = ['bunny:onboard', 'bunny:zone:apply', 'bunny:apply -- --zone dev --dry-run', 'bunny:verify'].map((t) =>
        ogd.indexOf(`task ${t}`),
      );
      expect(at.every((i) => i > -1)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
    });
  });

  describe('OG-V', () => {
    const ogv = section('OG-V: preview zones');

    it('onboards each preview site, then brings its zone up with the slug form', () => {
      expect(ogv).toContain('task bunny:onboard -- --preview <site>');
      expect(ogv).toContain('task bunny:zone:apply -- --zone preview:<slug>');
      expect(ogv).toMatch(/`preview:rules-ocx`, not `preview:rules_ocx`/);
    });
  });
});
