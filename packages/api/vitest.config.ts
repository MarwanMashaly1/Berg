import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**/*.ts', 'src/lib/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/lib/pg-boss-esm*'],
    },
  },
  resolve: {
    alias: {
      '@berg/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
});
