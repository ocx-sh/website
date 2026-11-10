/**
 * The installer line per shell; `lang` highlights it in that shell's grammar.
 * @type {{ label: string, icon: 'shell' | 'powershell' | 'nushell' | 'fish' | 'elvish' | 'cmd', lang: string, command: string, os?: 'windows' }[]}
 */
export const SHELLS = [
  { label: 'Shell', icon: 'shell', lang: 'sh', command: 'curl -fsSL https://setup.ocx.sh/sh | sh' },
  {
    label: 'PowerShell',
    icon: 'powershell',
    lang: 'powershell',
    command: 'irm https://setup.ocx.sh/pwsh | iex',
    os: 'windows',
  },
  { label: 'Nushell', icon: 'nushell', lang: 'nushell', command: 'nu -c (http get https://setup.ocx.sh/nu)' },
  { label: 'fish', icon: 'fish', lang: 'fish', command: 'curl -fsSL https://setup.ocx.sh/fish | fish' },
  {
    label: 'Elvish',
    icon: 'elvish',
    lang: 'elvish',
    command: 'elvish -c (e:curl -fsSL https://setup.ocx.sh/elvish | slurp)',
  },
];
