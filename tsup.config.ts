import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/decorators/index.ts',
    'src/experimental/index.ts',
    'src/node/index.ts',
    'src/observability/index.ts',
    'src/policy/index.ts',
    'src/store/index.ts',
    'src/patterns/*/*.ts',
    'src/public/*.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
});
