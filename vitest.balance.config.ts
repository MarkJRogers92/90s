import { defineConfig } from 'vitest/config';

// The balance report plays hundreds of nights, so it is kept out of the default
// `npm test` and run on request with `npm run balance`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/balance/**/*.test.ts'],
  },
});
