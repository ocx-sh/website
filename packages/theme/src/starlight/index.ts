import type { StarlightExpressiveCodeOptions } from '@astrojs/starlight/expressive-code';
import type { StarlightPlugin } from '@astrojs/starlight/types';

// Code frames are Expressive Code's own markup, out of base.css's reach, so
// the same tokens are fed in through its style overrides.
const EXPRESSIVE_CODE: StarlightExpressiveCodeOptions = {
  themes: ['github-dark-default', 'github-light-default'],
  useStarlightDarkModeSwitch: true,
  styleOverrides: {
    borderRadius: '2px',
    borderWidth: '1px',
    borderColor: 'var(--ocx-color-border)',
    codeBackground: 'var(--ocx-color-code-bg)',
    codeFontFamily: 'var(--ocx-font-mono)',
    codeFontSize: '0.85em',
    codeLineHeight: '1.75',
    uiFontFamily: 'var(--ocx-font-mono)',
    uiFontSize: 'var(--ocx-text-xs)',
    focusBorder: 'var(--ocx-color-accent)',
    frames: {
      shadowColor: 'transparent',
      editorTabBarBackground: 'var(--ocx-color-surface-subtle)',
      editorActiveTabBackground: 'var(--ocx-color-code-bg)',
      editorActiveTabIndicatorTopColor: 'var(--ocx-color-accent)',
      terminalTitlebarBackground: 'var(--ocx-color-surface-subtle)',
      terminalTitlebarBorderBottomColor: 'var(--ocx-color-border)',
      terminalBackground: 'var(--ocx-color-code-bg)',
      inlineButtonBorder: 'var(--ocx-color-border)',
    },
  },
};

/** Starlight plugin: OCX tokens, base styles, header and code-block theme. */
export default function ocxTheme(): StarlightPlugin {
  return {
    name: '@ocx-sh/theme',
    hooks: {
      'config:setup'({ config, updateConfig }) {
        const own = config.expressiveCode;
        const expressiveCode = own === false ? false : { ...EXPRESSIVE_CODE, ...(own === true ? {} : own) };
        updateConfig({
          // Theme first, so a consumer's own customCss still wins.
          customCss: [
            '@ocx-sh/theme/fonts.css',
            '@ocx-sh/theme/tokens.css',
            '@ocx-sh/theme/base.css',
            '@ocx-sh/theme/starlight.css',
            ...(config.customCss ?? []),
          ],
          components: { Header: '@ocx-sh/theme/starlight/Header.astro', ...config.components },
          expressiveCode,
        });
      },
    },
  };
}
