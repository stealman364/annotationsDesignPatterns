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
);
