import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['dist/**', 'coverage/**', 'scripts/**', 'tests/**', '**/*.d.ts'],
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        branches: -125,
        functions: -16,
        lines: -142,
        statements: -146,
      },
    },
  },
});
