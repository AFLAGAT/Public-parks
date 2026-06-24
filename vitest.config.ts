import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts'],
    passWithNoTests: false,
    env: {
      APP_NODE_ENV: 'test',
      DB_PRIMARY_URL: 'postgres://parks:parks_dev@localhost:5432/parks_test',
    },
  },
});
