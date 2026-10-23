// The command-palette showcase's search: a fixed index of two groups, matched by case-insensitive
// substring. Links are in-page anchors, so following one in a story frame reloads nothing.
const PACKAGES = [
  { name: 'ocx.sh/tools/cmake', title: 'CMake' },
  { name: 'ocx.sh/tools/ninja', title: 'Ninja' },
  { name: 'ocx.sh/runtimes/node', title: 'Node.js' },
  { name: 'ocx.sh/runtimes/python', title: 'Python' },
];
const DOCS = [
  { path: 'Guides › Install', title: 'Install ocx' },
  { path: 'Guides › Packages', title: 'Publish a package' },
  { path: 'Reference › CLI', title: 'ocx install' },
];

/** @param {string} text @param {string} query */
const matches = (text, query) => text.toLowerCase().includes(query.toLowerCase());

/** @param {string} query */
export function search(query) {
  return [
    {
      label: 'Packages',
      items: PACKAGES.filter((p) => matches(p.title + p.name, query)).map((p) => ({
        href: `#${p.name}`,
        label: p.title,
        description: p.name,
      })),
    },
    {
      label: 'Docs',
      items: DOCS.filter((d) => matches(d.title + d.path, query)).map((d) => ({
        href: `#${d.title}`,
        label: d.title,
        description: d.path,
      })),
    },
  ];
}
