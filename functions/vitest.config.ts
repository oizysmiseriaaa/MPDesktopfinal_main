import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['lib/lib/__tests__/**/*.test.mjs'],
  },
});
