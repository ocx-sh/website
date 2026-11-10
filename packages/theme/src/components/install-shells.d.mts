/**
 * The installer line per shell; `lang` highlights it in that shell's grammar.
 * @type {{ label: string, icon: 'shell' | 'powershell' | 'nushell' | 'fish' | 'elvish' | 'cmd', lang: string, command: string, os?: 'windows' }[]}
 */
export const SHELLS: {
    label: string;
    icon: "shell" | "powershell" | "nushell" | "fish" | "elvish" | "cmd";
    lang: string;
    command: string;
    os?: "windows";
}[];
