// The cutover runbook is a runbook page, so a step that no longer resolves must fail the merge.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url).pathname;
const readme = readFileSync(new URL('README.md', import.meta.url), 'utf8');

/** Fenced blocks of a language, in document order. */
const fences = (lang: string) =>
  [...readme.matchAll(new RegExp('^```' + lang + '\\n([\\s\\S]*?)^```', 'gm'))].map((m) => m[1]);

/** The text between a `## ` heading and the next one. */
const section = (title: string) => {
  const start = readme.indexOf(`\n## ${title}`);
  expect(start, `section "${title}"`).toBeGreaterThan(-1);
  const end = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, end === -1 ? undefined : end);
};

/** Tasks of the `server-hetzner1` repo, which this repo's task list cannot know. */
const otherRepo = /^(nginx|cert):/;

const taskList = spawnSync('task', ['--list-all', '--json'], { cwd: root, encoding: 'utf8' });
const hasTask = !taskList.error && taskList.status === 0;
// CI must never skip the check: a missing `task` there fails it instead.
const skipTaskCheck = !hasTask && !process.env['CI'];
if (skipTaskCheck)
  console.warn('runbook.test: `task` is not on PATH, skipping the task-name check (run via `ocx exec --`)');

describe('cutover README', () => {
  it('declares itself a runbook inside the first 12 lines', () => {
    expect(readme.split('\n').slice(0, 12)).toContain('<!-- doc_type: runbook -->');
  });

  it.skipIf(skipTaskCheck)('every `task` command it names exists in `task --list-all`', () => {
    expect(hasTask, '`task` is not on PATH; run via `ocx exec --`').toBe(true);
    const known = new Set((JSON.parse(taskList.stdout) as { tasks: { name: string }[] }).tasks.map((t) => t.name));
    const code = [...fences('bash'), ...[...readme.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])].join('\n');
    const named = [...code.matchAll(/(?:^|\s)task ([a-z][\w:-]*)/g)]
      .map((m) => m[1] ?? '')
      .filter((n) => !otherRepo.test(n));
    expect(named.length).toBeGreaterThan(5);
    expect(named.filter((n) => !known.has(n))).toEqual([]);
  });

  it('names the real hosts that carry the apex today', () => {
    const intro = readme.split('\n').slice(0, 7).join('\n');
    expect(intro).toMatch(/moves from hetzner1 nginx and `pages\.dev` to Bunny/);
    expect(readme).not.toMatch(/GitHub Pages/);
  });

  it('keeps credentials out of argv, the shell environment and the repo tree', () => {
    expect(readme).not.toMatch(/set -a/);
    expect(readme).not.toMatch(/-H "Authorization/);
    expect(readme).not.toMatch(/> ocx\.sh\.zone/);
    expect(readme).toMatch(/^\s*export CLOUDFLARE_API_TOKEN=\$\(sed -n 's\/\^CLOUDFLARE_API_TOKEN=\/\/p' \.env\)$/m);
    expect(readme).toMatch(/curl -s -K -/);
    expect(readme).toMatch(/> \.tmp\/ocx\.sh\.zone/);
  });

  it('its first step creates the environments `ocx.sh` and `previews` for branch `main`', () => {
    const first = section('OG-D: Bunny dev up');
    const step = first.slice(first.indexOf('### Step 1'), first.indexOf('### Step 2'));
    expect(step).toMatch(/^### Step 1: create the GitHub environments/);
    expect(step).toMatch(/for env in ocx\.sh previews/);
    expect(step).toMatch(/environments\/\$env"/);
    expect(step).toMatch(/name=main -f type=branch/);
    expect(step).toMatch(/Rollback:/);
  });

  it('needs the merged ocx PR for the Home link and the logo link', () => {
    expect(section('OG-D: Bunny dev up')).toMatch(/target: '_self'[\s\S]*logoLink/);
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

  describe('OG-N nginx snippet', () => {
    const [snippet = ''] = fences('nginx');

    it('is the only nginx block', () => {
      expect(fences('nginx')).toHaveLength(1);
    });

    it.each([
      ['Host ocx.sh', /^\s*proxy_set_header Host ocx\.sh;/m],
      ['proxy_ssl_server_name on', /^\s*proxy_ssl_server_name on;/m],
      ['proxy_ssl_name', /^\s*proxy_ssl_name ocx\.sh;/m],
      ['proxy_redirect to https://ocx.sh/', /^\s*proxy_redirect https:\/\/sh-ocx\.b-cdn\.net\/ https:\/\/ocx\.sh\/;/m],
      ['proxy_hide_header for HSTS', /^\s*proxy_hide_header Strict-Transport-Security;/m],
      ['proxy_hide_header for X-Frame-Options', /^\s*proxy_hide_header X-Frame-Options;/m],
      ['the real prod pull zone host', /set \$bunny sh-ocx\.b-cdn\.net;/],
    ])('carries %s', (_name, pattern) => {
      expect(snippet).toMatch(pattern);
    });

    it('has no proxy_cache directive', () => {
      const directives = snippet.replace(/#.*$/gm, '');
      expect(directives).not.toMatch(/proxy_cache/);
    });
  });

  describe('OG-N', () => {
    const ogn = section('OG-N: nginx upstream to Bunny');

    const step = (n: number) => ogn.slice(ogn.indexOf(`### Step ${n}`), ogn.indexOf(`### Step ${n + 1}`));

    it('audits Cloudflare caching and rehearses before the switch', () => {
      expect(ogn).toMatch(/respect existing headers/);
      expect(ogn).toMatch(/task cutover:verify -- --host next\.ocx\.sh\b/);
      expect(ogn).toMatch(/task cutover:verify -- --host edge\.ocx\.sh --registry/);
    });

    it('rehearses next.ocx.sh with its own host and noindex, and keeps P-N1 on the nginx hop', () => {
      const next = step(2);
      expect(next).toMatch(/`Host: next\.ocx\.sh`/);
      expect(next).toMatch(/`X-Robots-Tag: noindex` is present/);
      expect(next).not.toMatch(/P-N1/);
      expect(next).not.toMatch(/Host: ocx\.sh/);
      const edge = step(3);
      expect(edge).toMatch(/P-N1/);
      expect(edge).toMatch(/`Host: ocx\.sh`[^\n]*no `X-Robots-Tag`/);
    });

    it('turns the copied vhost into edge.ocx.sh: server_name and certificate paths, then location /', () => {
      const edge = step(3);
      expect(edge).toMatch(/Copy `ocx-sh-00\.conf`, set `server_name` to `edge\.ocx\.sh`/);
      expect(edge).toMatch(/certificate paths/);
      expect(edge).not.toMatch(/replace only/);
    });

    it('rolls back by reverting `location /` to ocx-website.pages.dev and reloading nginx', () => {
      expect(ogn).toMatch(/^Rollback: revert `location \/` to `ocx-website\.pages\.dev` and reload nginx\./m);
    });
  });

  describe('OG-D step 5', () => {
    it('waits for the deploy run between the dispatch and the verify', () => {
      const dev = section('OG-D: Bunny dev up');
      const step = dev.slice(dev.indexOf('### Step 5'));
      const order = ['gh workflow run site.yml', 'gh run watch', 'task cutover:verify -- --host sh-ocx-dev.b-cdn.net'];
      const at = order.map((needle) => step.indexOf(needle));
      expect(at.every((i) => i > -1)).toBe(true);
      expect(at).toEqual([...at].sort((a, b) => a - b));
      expect(step).toMatch(/--exit-status/);
    });
  });

  describe('OG-C', () => {
    const ogc = section('OG-C: apex DNS flip (deferred)');

    it('records the SSL mode and exports the zone', () => {
      expect(ogc).toMatch(/Record the SSL mode/);
      expect(ogc).toMatch(/dns_records\/export/);
    });

    it('records the hetzner1 certificate expiry as the rollback deadline', () => {
      expect(ogc).toMatch(/Record the new expiry date as the rollback deadline\./);
      expect(ogc).toMatch(/After it, rollback starts with a DNS-01 re-issue/);
    });

    it('reruns the `--resolve` rehearsal', () => {
      expect(ogc).toMatch(/task cutover:verify -- --host ocx\.sh --resolve <bunny ip>/);
    });
  });
});
