// The grim skills under skills/ teach agents this package (AGENTS.md "Working here"). This keeps
// them in step: every exported component is named in ocx-theme-components by its path under
// components/, every plugin option and Starlight override in ocx-theme-setup, every package export
// somewhere in skills/, and every skill is published and bundled.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const themeRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(themeRoot, '..', '..');
const skillsDir = join(repoRoot, 'skills');
const componentsDir = join(themeRoot, 'src', 'components');
const plugin = readFileSync(join(themeRoot, 'src', 'starlight', 'index.mjs'), 'utf8');
const pkg = JSON.parse(readFileSync(join(themeRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
  bin: Record<string, string>;
};

/** Every Markdown file of one skill (SKILL.md and references/), joined. */
function skillText(name: string): string {
  return readdirSync(join(skillsDir, name), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'))
    .join('\n');
}

/** Whether some `code span` in `text` holds `word` as a whole word. */
function inCodeSpan(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\`[^\`\\n]*\\b${escaped}\\b[^\`\\n]*\``).test(text);
}

/** Plugin option names: keys of the OcxThemeOptions typedef plus the destructured parameters. */
function pluginOptions(): string[] {
  const end = plugin.indexOf('}} OcxThemeOptions');
  const typedef = end < 0 ? '' : plugin.slice(plugin.lastIndexOf('@typedef {{', end), end);
  const params = /export default function ocxTheme\(\{([^)]*)\}\s*=\s*\{\}\)/.exec(plugin)?.[1] ?? '';
  const keys = [...typedef.matchAll(/(\w+)\??:/g), ...params.matchAll(/(\w+)\s*(?:=|,|$)/g)].map((m) => m[1]!);
  return [...new Set(keys)];
}

const skills = readdirSync(skillsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

describe('skills coverage', () => {
  it('ocx-theme-components names every exported component by its path under components/', () => {
    const text = skillText('ocx-theme-components');
    const components = readdirSync(componentsDir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.astro'))
      .map((e) => relative(componentsDir, join(e.parentPath, e.name)).split('\\').join('/'));
    expect(components.length).toBeGreaterThan(0);
    const missing = components.filter((spec) => !text.includes(`\`${spec}\``));
    expect(missing, `add to skills/ocx-theme-components: ${missing.join(', ')}`).toEqual([]);
  });

  it('ocx-theme-setup names every plugin option and every Starlight override', () => {
    const text = skillText('ocx-theme-setup');
    const options = pluginOptions();
    expect(options.length, 'no plugin option parsed from starlight/index.mjs').toBeGreaterThan(0);
    const overrides = [...(/const OVERRIDES = \[([\s\S]*?)\]/.exec(plugin)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(
      (m) => m[1]!,
    );
    expect(overrides.length, 'no OVERRIDES parsed from starlight/index.mjs').toBeGreaterThan(0);
    const missing = [...options, ...overrides].filter((name) => !inCodeSpan(text, name));
    expect(missing, `add to skills/ocx-theme-setup: ${missing.join(', ')}`).toEqual([]);
  });

  it('every package export and bin appears in some skill', () => {
    const text = skills.map(skillText).join('\n');
    const specifiers = Object.keys(pkg.exports)
      .filter((key) => !key.includes('*'))
      .map((key) => `@ocx-sh/theme/${key.slice(2)}`);
    const missing = [...specifiers, ...Object.keys(pkg.bin)].filter((s) => !text.includes(s));
    expect(missing, `add to skills/: ${missing.join(', ')}`).toEqual([]);
  });

  it('every skill is published by publish.toml and bundled by bundles/ocx-theme.toml', () => {
    const manifest = readFileSync(join(repoRoot, 'publish.toml'), 'utf8');
    const bundle = readFileSync(join(repoRoot, 'bundles', 'ocx-theme.toml'), 'utf8');
    expect(skills.length).toBeGreaterThan(0);
    for (const name of skills) {
      expect(manifest, `publish.toml lacks [skills.${name}]`).toContain(`[skills.${name}]`);
      expect(bundle, `bundles/ocx-theme.toml lacks ${name}`).toContain(`${name} = "./${name}"`);
    }
  });
});
