// Inline head scripts shared by the Starlight overrides and Shell. Hand-minified: every page carries them.
// Pre-paint `data-theme`: same storage key and fallback as Starlight's; `auto` or no entry follows the OS.
export const THEME_SCRIPT = `(()=>{let t;try{t=localStorage.getItem('starlight-theme')}catch{}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t})()`;

// <Kbd> platform detection: sets data-platform before first paint so no OS-specific key glyph flickers.
export const PLATFORM_SCRIPT = `((d,p=navigator.userAgentData?.platform||navigator.platform||'')=>{d.dataset.platform=/mac/i.test(p)?'mac':/linux/i.test(p)?'linux':'windows'})(document.documentElement)`;
