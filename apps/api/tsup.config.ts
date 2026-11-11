import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'db/migrate': 'src/db/migrate.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  splitting: false,
  noExternal: ['@mybusiness/shared'],
});
