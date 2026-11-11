import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import type pg from 'pg';
import type { Role } from '@mybusiness/shared';
import { requirePool } from '../db/pool.js';
import { SESSION_DAYS } from './cookies.js';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Create a session and return the raw token for the cookie (the database only keeps its hash). */
export async function createSession(db: pg.PoolClient | pg.Pool, userId: string, tenantId: string, req: Request): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (id, user_id, tenant_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, now() + make_interval(days => $4), $5, $6)`,
    [hashToken(token), userId, tenantId, SESSION_DAYS, (req.headers['user-agent'] ?? '').slice(0, 300), req.ip ?? null],
  );
  return token;
}

export interface SessionInfo {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: Role;
  lastSeenAt: Date;
}

/** A live session, or null if it's expired, unknown, or the user no longer belongs to that business. */
export async function findSession(token: string): Promise<SessionInfo | null> {
  const r = await requirePool().query<{ id: string; user_id: string; tenant_id: string; role: Role; last_seen_at: Date }>(
    `SELECT s.id, s.user_id, s.tenant_id, m.role, s.last_seen_at
     FROM sessions s JOIN memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const s = r.rows[0];
  return s ? { sessionId: s.id, userId: s.user_id, tenantId: s.tenant_id, role: s.role, lastSeenAt: s.last_seen_at } : null;
}

/** Sliding expiry: at most once an hour, push the expiry 30 days out from now. */
export async function touchSession(s: SessionInfo) {
  if (Date.now() - s.lastSeenAt.getTime() < 60 * 60 * 1000) return;
  await requirePool().query('UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1', [
    s.sessionId,
    SESSION_DAYS,
  ]);
}

export async function deleteSession(token: string) {
  await requirePool().query('DELETE FROM sessions WHERE id = $1', [hashToken(token)]);
}
