// Copy and illustrative data of the landing page, rendered at build time by Landing.astro.
// Every command and output line was run against ocx 0.6.5 (Node v24.22.2, 2026-11-09); digests stay elided to four
// characters each end (`sha256:1e34…e370`), and no timing or size is claimed.

/** Package every example on the page adds: fully qualified, as `ocx.toml` requires, and resolvable on ocx.sh. */
export const PACKAGE = 'ocx.sh/nodejs/node:24';

/**
 * One card of "the problem": one way a machine gets Node, and the version that way gives. Versions as of
 * 2026-11-08: packages.ubuntu.com/noble/nodejs, packages.debian.org/trixie/nodejs, formulae.brew.sh/formula/node,
 * winget-pkgs OpenJS.NodeJS.LTS, endoflife.date/nodejs, github.com/actions/setup-node/releases.
 */
export const PROBLEM: readonly { os: string; cmd: string; note: string }[] = [
  { os: 'Ubuntu 24.04', cmd: 'apt-get install nodejs', note: 'Node 18 · end of life since 2025' },
  { os: 'Debian 13', cmd: 'apt-get install nodejs', note: 'Node 20 · end of life since April' },
  { os: 'macOS', cmd: 'brew install node', note: 'Node 26 · whatever is newest' },
  { os: 'Windows', cmd: 'winget install OpenJS.NodeJS.LTS', note: 'Node 26 · the current LTS' },
  { os: 'nvm', cmd: 'nvm install', note: 'per shell, from .nvmrc · no Windows' },
  { os: 'CI runner', cmd: 'uses: actions/setup-node@v7', note: 'one more syntax per CI vendor' },
];

/** The lock table of the first pillar. */
export const LOCK = {
  headers: [`ocx.toml · node = "${PACKAGE}"`, 'ocx.lock'],
  rows: [
    { key: 'linux/amd64', value: '→ sha256:e8c4…12bf', highlight: true, note: '← CI runner' },
    { key: 'linux/arm64', value: '→ sha256:2334…057c' },
    { key: 'darwin/arm64', value: '→ sha256:1e34…e370', highlight: true, note: '← laptop' },
    { key: 'windows/amd64', value: '→ sha256:8e7e…9214' },
  ],
  footer: 'tag 24 floats · digests stay put',
};

/** The registries of the second pillar. */
export const REGISTRIES: { title: string; subtitle: string }[] = [
  { title: 'GitHub', subtitle: 'ghcr.io' },
  { title: 'GitLab', subtitle: 'registry.gitlab.com' },
  { title: 'Artifactory', subtitle: 'cloud or on-prem' },
  { title: 'Amazon ECR', subtitle: '*.ecr.aws' },
  { title: 'Azure', subtitle: '*.azurecr.io' },
  { title: 'Harbor', subtitle: 'self-hosted' },
];

/**
 * The sessions of the deferred fragments (site/src/fragments/landing-hero.mdx and landing-supply.mdx), command and
 * output fences in order: the skeletons size themselves from these lines, and landing.test.ts holds the
 * fragments to them.
 */
export const HERO_SESSION: readonly string[] = [
  'ocx init',
  'created ~/acme/ocx.toml',
  `ocx add ${PACKAGE}`,
  'Binding  Group    Digest\nnode     default  sha256:1e34…e370',
  'ocx exec -- node --version',
  'v24.22.2',
];

export const SUPPLY_SESSION: readonly string[] = [
  `ocx package pull ${PACKAGE}\nocx --offline package exec \\\n  ${PACKAGE} -- node --version`,
  'v24.22.2',
];

/** The tallest integration panel of fragments/landing-integrations.mdx (Bazel), in code lines. */
export const TALLEST_PANEL = 'x\n'.repeat(10);
