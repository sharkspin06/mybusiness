import { defineConfig } from 'tsup';

export default defineConfig({
  // app.js is the request handler without listen(), used by the Vercel function in /api.
  entry: { index: 'src/index.ts', app: 'src/app.ts', 'db/migrate': 'src/db/migrate.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  splitting: false,
  noExternal: ['@mybusiness/shared'],
});
