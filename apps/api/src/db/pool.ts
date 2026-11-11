import pg from 'pg';
import { config } from '../config.js';

// Postgres returns NUMERIC/BIGINT as strings by default; money is stored as integer cents (BIGINT).
pg.types.setTypeParser(20, (v) => Number(v));
// DATE columns stay as "YYYY-MM-DD" text. Turning them into JS Dates would shift them a day in Singapore time.
pg.types.setTypeParser(1082, (v) => v);

export const pool = config.databaseUrl ? new pg.Pool({ connectionString: config.databaseUrl, max: 10 }) : null;

export function requirePool(): pg.Pool {
  if (!pool) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  return pool;
}

/**
 * Run queries for one business (tenant). Every business table has tenant_id, and every
 * query in a module goes through this helper so data is never mixed between businesses.
 * It also sets app.tenant_id for the transaction, ready for Postgres row-level security.
 */
export async function withTenant<T>(tenantId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
