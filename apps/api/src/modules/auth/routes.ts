import { Router, type Request, type Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import {
  acceptInviteSchema,
  loginSchema,
  newPasswordSchema,
  passwordChangeSchema,
  signupSchema,
  PASSWORD_MIN,
  type InviteInfo,
  type Me,
  type Role,
} from '@mybusiness/shared';
import { findToken } from '../../lib/tokens.js';
import { requirePool } from '../../db/pool.js';
import { auth, requireAuth } from '../../lib/auth.js';
import { SESSION_COOKIE, clearSessionCookie, readCookie, setSessionCookie } from '../../lib/cookies.js';
import { sendValidationError } from '../../lib/http.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password.js';
import { clearAttempts, isLimited, recordAttempt } from '../../lib/rateLimit.js';
import { createSession, deleteSession } from '../../lib/sessions.js';

export const authRoutes = Router();

const WINDOW = 15 * 60 * 1000;

async function loadMe(db: pg.Pool | pg.PoolClient, userId: string, tenantId: string): Promise<Me | null> {
  const u = await db.query<{ id: string; name: string; email: string }>('SELECT id, name, email FROM users WHERE id = $1', [userId]);
  const list = await db.query<{ id: string; name: string; plan: string; role: Role }>(
    `SELECT t.id, t.name, t.plan, m.role FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = $1 ORDER BY t.name`,
    [userId],
  );
  const user = u.rows[0];
  const current = list.rows.find((t) => t.id === tenantId);
  if (!user || !current) return null;
  return {
    user,
    business: { id: current.id, name: current.name, plan: current.plan },
    role: current.role,
    businesses: list.rows.map((t) => ({ id: t.id, name: t.name, role: t.role })),
  };
}

// POST /api/auth/signup — new business + its owner, signed in straight away.
authRoutes.post('/signup', async (req: Request, res: Response) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { name, businessName, email, password } = parsed.data;
  const ipKey = `signup:${req.ip}`;
  if (isLimited(ipKey, 10)) return res.status(429).json({ error: 'too_many_attempts' });
  recordAttempt(ipKey, 60 * 60 * 1000);

  const passwordHash = await hashPassword(password);
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (exists.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'email_taken', fields: { email: 'This email already has an account. Sign in instead.' } });
    }
    const t = await client.query<{ id: string }>('INSERT INTO tenants (name) VALUES ($1) RETURNING id', [businessName]);
    const u = await client.query<{ id: string }>(
      'INSERT INTO users (email, name, password_hash, last_login_at) VALUES ($1, $2, $3, now()) RETURNING id',
      [email, name, passwordHash],
    );
    const tenantId = t.rows[0]!.id;
    const userId = u.rows[0]!.id;
    await client.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')`, [tenantId, userId]);
    const token = await createSession(client, userId, tenantId, req);
    const me = await loadMe(client, userId, tenantId);
    await client.query('COMMIT');
    setSessionCookie(res, token);
    res.status(201).json(me);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /api/auth/login
authRoutes.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { email, password } = parsed.data;
  const keys = [`login:${req.ip}:${email}`, `login-ip:${req.ip}`];
  if (isLimited(keys[0]!, 8) || isLimited(keys[1]!, 40)) return res.status(429).json({ error: 'too_many_attempts' });

  const pool = requirePool();
  const r = await pool.query<{ id: string; password_hash: string | null }>('SELECT id, password_hash FROM users WHERE lower(email) = $1', [email]);
  const user = r.rows[0];
  const ok = user?.password_hash ? await verifyPassword(password, user.password_hash) : (await burnPasswordCheck(password), false);
  if (!user || !ok) {
    keys.forEach((k) => recordAttempt(k, WINDOW));
    // Same message whether the email or the password was wrong.
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  clearAttempts(keys[0]!);

  // Start in the business they used most recently, else the first one alphabetically.
  const t = await pool.query<{ tenant_id: string }>(
    `SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     LEFT JOIN LATERAL (SELECT max(last_seen_at) AS seen FROM sessions s WHERE s.user_id = m.user_id AND s.tenant_id = m.tenant_id) ls ON true
     WHERE m.user_id = $1 ORDER BY ls.seen DESC NULLS LAST, t.name LIMIT 1`,
    [user.id],
  );
  const tenantId = t.rows[0]?.tenant_id;
  if (!tenantId) return res.status(403).json({ error: 'no_business' });
  const token = await createSession(pool, user.id, tenantId, req);
  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  setSessionCookie(res, token);
  res.json(await loadMe(pool, user.id, tenantId));
});

// POST /api/auth/logout
authRoutes.post('/logout', async (req: Request, res: Response) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await deleteSession(token);
  clearSessionCookie(res);
  res.status(204).end();
});

// GET /api/auth/me
authRoutes.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { userId, tenantId } = auth(req);
  const me = await loadMe(requirePool(), userId, tenantId);
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  res.json(me);
});

// POST /api/auth/switch { tenantId } — work in another business the user belongs to.
authRoutes.post('/switch', requireAuth, async (req: Request, res: Response) => {
  const parsed = z.object({ tenantId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { userId, sessionId } = auth(req);
  const pool = requirePool();
  const m = await pool.query('SELECT 1 FROM memberships WHERE user_id = $1 AND tenant_id = $2', [userId, parsed.data.tenantId]);
  if (!m.rowCount) return res.status(403).json({ error: 'forbidden' });
  await pool.query('UPDATE sessions SET tenant_id = $2 WHERE id = $1', [sessionId, parsed.data.tenantId]);
  res.json(await loadMe(pool, userId, parsed.data.tenantId));
});

// ---- Your account ----

// PATCH /api/auth/me { name }
authRoutes.patch('/me', requireAuth, async (req: Request, res: Response) => {
  const parsed = z.object({ name: z.string().trim().min(1, 'Enter your name').max(100) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { userId, tenantId } = auth(req);
  const pool = requirePool();
  await pool.query('UPDATE users SET name = $2, updated_at = now() WHERE id = $1', [userId, parsed.data.name]);
  res.json(await loadMe(pool, userId, tenantId));
});

// POST /api/auth/password { currentPassword, newPassword } — also signs out your other devices.
authRoutes.post('/password', requireAuth, async (req: Request, res: Response) => {
  const parsed = passwordChangeSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { userId, sessionId } = auth(req);
  const key = `password:${userId}`;
  if (isLimited(key, 8)) return res.status(429).json({ error: 'too_many_attempts' });
  const pool = requirePool();
  const r = await pool.query<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const hash = r.rows[0]?.password_hash;
  if (!hash || !(await verifyPassword(parsed.data.currentPassword, hash))) {
    recordAttempt(key, WINDOW);
    return res.status(400).json({ error: 'validation', fields: { currentPassword: 'That isn’t your current password' } });
  }
  clearAttempts(key);
  await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, await hashPassword(parsed.data.newPassword)]);
  await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, sessionId]);
  res.status(204).end();
});

// ---- Invite links (public: the token in the link is the key) ----

// GET /api/auth/invite/:token
authRoutes.get('/invite/:token', async (req: Request, res: Response) => {
  const pool = requirePool();
  const t = await findToken(pool, String(req.params.token), 'invite');
  if (!t) return res.status(404).json({ error: 'invalid_link' });
  const biz = await pool.query<{ name: string }>('SELECT name FROM tenants WHERE id = $1', [t.tenant_id]);
  const user = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [t.email]);
  const info: InviteInfo = { businessName: biz.rows[0]?.name ?? '', email: t.email!, role: t.role!, accountExists: !!user.rowCount };
  res.json(info);
});

// POST /api/auth/invite/:token/accept { name, password }
// New person: creates their account with that password. Existing account: the password must be theirs.
authRoutes.post('/invite/:token/accept', async (req: Request, res: Response) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const ipKey = `invite:${req.ip}`;
  if (isLimited(ipKey, 20)) return res.status(429).json({ error: 'too_many_attempts' });
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const t = await findToken(client, String(req.params.token), 'invite', true);
    if (!t) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'invalid_link' });
    }
    const existing = await client.query<{ id: string; password_hash: string | null }>('SELECT id, password_hash FROM users WHERE lower(email) = $1', [t.email]);
    let userId: string;
    if (existing.rows[0]) {
      const u = existing.rows[0];
      if (!u.password_hash || !(await verifyPassword(parsed.data.password, u.password_hash))) {
        await client.query('ROLLBACK');
        recordAttempt(ipKey, WINDOW);
        return res.status(400).json({ error: 'validation', fields: { password: 'That isn’t the password for this account' } });
      }
      userId = u.id;
    } else {
      const name = parsed.data.name?.trim();
      const fields: Record<string, string> = {};
      if (!name) fields.name = 'Enter your name';
      if (parsed.data.password.length < PASSWORD_MIN) fields.password = `Use at least ${PASSWORD_MIN} characters`;
      if (Object.keys(fields).length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'validation', fields });
      }
      const u = await client.query<{ id: string }>('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id', [
        t.email,
        name,
        await hashPassword(parsed.data.password),
      ]);
      userId = u.rows[0]!.id;
    }
    await client.query('INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (tenant_id, user_id) DO NOTHING', [
      t.tenant_id,
      userId,
      t.role,
    ]);
    await client.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [t.id]);
    await client.query(`INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, data) VALUES ($1, $2, 'team.joined', 'team', $2, $3)`, [
      t.tenant_id,
      userId,
      JSON.stringify({ email: t.email, role: t.role }),
    ]);
    await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
    const token = await createSession(client, userId, t.tenant_id!, req);
    const me = await loadMe(client, userId, t.tenant_id!);
    await client.query('COMMIT');
    setSessionCookie(res, token);
    res.json(me);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ---- Password reset links (made by an owner or admin for a team member) ----

// GET /api/auth/reset/:token
authRoutes.get('/reset/:token', async (req: Request, res: Response) => {
  const pool = requirePool();
  const t = await findToken(pool, String(req.params.token), 'reset');
  if (!t) return res.status(404).json({ error: 'invalid_link' });
  const u = await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [t.user_id]);
  res.json({ email: u.rows[0]?.email ?? '' });
});

// POST /api/auth/reset/:token { password } — sets the password, signs out everywhere, then signs in here.
authRoutes.post('/reset/:token', async (req: Request, res: Response) => {
  const parsed = newPasswordSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const t = await findToken(client, String(req.params.token), 'reset', true);
    if (!t) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'invalid_link' });
    }
    const userId = t.user_id!;
    await client.query('UPDATE users SET password_hash = $2, updated_at = now(), last_login_at = now() WHERE id = $1', [userId, await hashPassword(parsed.data.password)]);
    await client.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [t.id]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    const m = await client.query<{ tenant_id: string }>('SELECT tenant_id FROM memberships WHERE user_id = $1 LIMIT 1', [userId]);
    const tenantId = m.rows[0]?.tenant_id;
    if (!tenantId) {
      await client.query('COMMIT');
      return res.status(204).end();
    }
    const token = await createSession(client, userId, tenantId, req);
    const me = await loadMe(client, userId, tenantId);
    await client.query('COMMIT');
    setSessionCookie(res, token);
    res.json(me);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
