import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import oxlint from 'eslint-plugin-oxlint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/node_modules/**',
      '.tmp/**',
      '.agents/worktrees/**',
      'tests/fixtures/**',
      'packages/theme/test/fixtures/**',
      '**/*.d.mts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // astro-eslint-parser v3; it picks up the typescript-eslint parser for frontmatter and <script>.
  ...astro.configs.recommended,
  // .astro is outside the TS program (no tsc plugin), so the projectService cannot type it; astro check covers it.
  { files: ['**/*.astro', '**/*.astro/*.ts'], ...tseslint.configs.disableTypeChecked },
  // tsc (checkJs) resolves globals for JS files; no-undef would duplicate it without Node globals.
  { files: ['**/*.{js,mjs,cjs}'], rules: { 'no-undef': 'off' } },
  // .cjs is CommonJS by definition (lhci only loads .lighthouserc.cjs as CJS).
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  // Last: turn off every ESLint rule oxlint already runs.
  ...oxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
);
