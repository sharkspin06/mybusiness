import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import type { Role } from '@mybusiness/shared';
import { hashToken } from './sessions.js';

export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;

/** Create a one-time invite or reset link token. Returns the raw token (only its hash is stored). */
export async function createToken(
  db: pg.PoolClient | pg.Pool,
  t: { kind: 'invite'; tenantId: string; email: string; role: Role; createdBy: string } | { kind: 'reset'; userId: string; createdBy: string },
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  if (t.kind === 'invite') {
    await db.query(
      `INSERT INTO auth_tokens (id, kind, tenant_id, email, role, created_by, expires_at)
       VALUES ($1, 'invite', $2, $3, $4, $5, now() + make_interval(days => $6))`,
      [hashToken(token), t.tenantId, t.email, t.role, t.createdBy, INVITE_DAYS],
    );
  } else {
    await db.query(
      `INSERT INTO auth_tokens (id, kind, user_id, created_by, expires_at) VALUES ($1, 'reset', $2, $3, now() + make_interval(hours => $4))`,
      [hashToken(token), t.userId, t.createdBy, RESET_HOURS],
    );
  }
  return token;
}

export interface TokenRow {
  id: string;
  kind: 'invite' | 'reset';
  tenant_id: string | null;
  email: string | null;
  role: Role | null;
  user_id: string | null;
}

/** A token that exists, isn't used and hasn't expired. Locks the row when `forUpdate` is set. */
export async function findToken(db: pg.PoolClient | pg.Pool, raw: string, kind: 'invite' | 'reset', forUpdate = false): Promise<TokenRow | null> {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(raw)) return null;
  const r = await db.query<TokenRow>(
    `SELECT id, kind, tenant_id, email, role, user_id FROM auth_tokens
     WHERE id = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()${forUpdate ? ' FOR UPDATE' : ''}`,
    [hashToken(raw), kind],
  );
  return r.rows[0] ?? null;
}
