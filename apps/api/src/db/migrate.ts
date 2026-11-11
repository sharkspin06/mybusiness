// Plain-SQL migrations: apps/api/migrations/NNN_name.sql, applied in order, each in a transaction.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requirePool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../migrations');

async function main() {
  const pool = requirePool();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const done = new Set((await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
      applied++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`failed ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(applied ? `${applied} migration(s) applied` : 'database is up to date');
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
