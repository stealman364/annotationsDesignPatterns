import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['dist/**', 'coverage/**', 'scripts/**', 'tests/**', '**/*.d.ts'],
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        branches: -125,
        functions: -12,
        lines: -130,
        statements: -138,
        // These are percentages for critical files, not perFile absolute budgets.
        'src/core/cancellation.ts': { lines: 100, statements: 100, functions: 100, branches: 95 },
        'src/core/permit-queue.ts': { lines: 100, statements: 100, functions: 100, branches: 95 },
        'src/operators/circuit-breaker.ts': { lines: 95, branches: 90 },
        'src/operators/overlap.ts': { lines: 90, branches: 90 },
        'src/policy/validation.ts': { lines: 80, branches: 80 },
      },
    },
  },
});
