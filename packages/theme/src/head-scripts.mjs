// Inline head scripts shared by the Starlight overrides and Shell. Hand-minified: every page carries them.
// Pre-paint `data-theme` and the `dark` class (D-127: a consumer's `.dark { --ocx-… }` block applies). Same storage
// key and fallback as Starlight's; `auto` or no entry follows the OS. A 0.5.x visitor's `vitepress-theme-appearance`
// choice is moved once, synchronously, into `starlight-theme` when that has no entry and it is light, dark or auto (else just dropped) (D-132): no flash, no legacy key left.
export const THEME_SCRIPT = `(()=>{let t,d=document.documentElement;try{const s=localStorage,k='vitepress-theme-appearance';t=s.getItem('starlight-theme');if(t===null&&(t=s.getItem(k))!==null){/^(light|dark|auto)$/.test(t)?s.setItem('starlight-theme',t):t=null;s.removeItem(k)}}catch{}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';d.dataset.theme=t;d.classList.toggle('dark',t==='dark')})()`;

// <Kbd> platform detection: sets data-platform before first paint so no OS-specific key glyph flickers.
export const PLATFORM_SCRIPT = `((d,p=navigator.userAgentData?.platform||navigator.platform||'')=>{d.dataset.platform=/mac|iphone|ipad|ipod/i.test(p)?'mac':/linux/i.test(p)?'linux':'windows'})(document.documentElement)`;
