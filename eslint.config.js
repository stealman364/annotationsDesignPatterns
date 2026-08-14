import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Regla del proyecto: any solo se permite en firmas de constructor
      // `new (...args: any[]) => object` (rest args).
      '@typescript-eslint/no-explicit-any': ['error', { ignoreRestArgs: true }],
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      globals: { console: 'readonly', require: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { URL: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },
);
