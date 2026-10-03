import { defineConfig } from 'vitest/config';

// Explicit-only diagnostic. Never added to the normal unit-test include list.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['diagnostics/loot-visuals/record.test.ts'],
  },
});
