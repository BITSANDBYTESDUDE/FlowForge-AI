import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['node_modules', 'e2e'],
    setupFiles: ['tests/setup.ts'],
    // Integration tests share one MongoDB database and each file clears every
    // collection between cases, so running files in parallel lets one file delete
    // another's fixtures mid-test. Serialising files removes the race; the suite
    // is small enough that the wall-clock cost is not noticeable.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
