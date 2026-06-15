import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      'expo-crypto': resolve(__dirname, 'src/__test_shims__/expo-crypto.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
