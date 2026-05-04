import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    // unit + integration tests live under tests/unit and tests/api;
    // tests/e2e is owned by Playwright and stays excluded.
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    exclude: ['node_modules', 'tests/e2e/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.d.ts', 'lib/migrations/**'],
    },
    setupFiles: ['./tests/helpers/setup.ts'],
  },
});
