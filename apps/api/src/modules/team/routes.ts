import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { ROLES, inviteSchema, type Role, type TeamResponse } from '@mybusiness/shared';
import { config } from '../../config.js';
import { requirePool, withTenant } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { auth, requireAuth, requireManager } from '../../lib/auth.js';
import { isUuid, sendValidationError } from '../../lib/http.js';
import { createToken } from '../../lib/tokens.js';

export const teamRoutes = Router();
teamRoutes.use(requireAuth);

const inviteLink = (token: string) => `${config.publicUrl}/invite/${token}`;
const resetLink = (token: string) => `${config.publicUrl}/reset/${token}`;

// GET /api/team — everyone can see who's in the business; pending invites only for owners and admins.
teamRoutes.get('/', async (req, res) => {
  const { tenantId, userId, role } = auth(req);
  const body = await withTenant(tenantId, async (db) => {
    const m = await db.query(
      `SELECT u.id, u.name, u.email, m.role,
              (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id AND s.tenant_id = m.tenant_id) AS last_active
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = $1
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name`,
      [tenantId],
    );
    const inv =
      role === 'staff'
        ? { rows: [] }
        : await db.query(
            `SELECT id, email, role, created_at, expires_at FROM auth_tokens
             WHERE tenant_id = $1 AND kind = 'invite' AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
            [tenantId],
          );
    const out: TeamResponse = {
      members: m.rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        lastActiveAt: r.last_active?.toISOString() ?? null,
        isYou: r.id === userId,
      })),
      // The id is the token hash: fine to show (it can't be turned back into a link).
      invites: inv.rows.map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at.toISOString(), expiresAt: r.expires_at.toISOString() })),
    };
    return out;
  });
  res.json(body);
});

// POST /api/team/invites { email, role } → { link } to send to the person (WhatsApp, email…).
teamRoutes.post('/invites', requireManager, async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { email, role } = parsed.data;
  const me = auth(req);
  if (role === 'owner' && me.role !== 'owner') return res.status(403).json({ error: 'forbidden', fields: { role: 'Only an owner can invite another owner' } });
  const result = await withTenant(me.tenantId, async (db) => {
    const member = await db.query('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 AND lower(u.email) = $2', [me.tenantId, email]);
    if (member.rowCount) return { error: 'already_member' as const };
    // One live invite per email: a new one replaces the old link.
    await db.query(`DELETE FROM auth_tokens WHERE tenant_id = $1 AND kind = 'invite' AND email = $2 AND used_at IS NULL`, [me.tenantId, email]);
    const token = await createToken(db, { kind: 'invite', tenantId: me.tenantId, email, role, createdBy: me.userId });
    await writeAudit(db, { tenantId: me.tenantId, userId: me.userId, action: 'team.invited', entityType: 'team', entityId: me.tenantId, data: { email, role } });
    return { link: inviteLink(token) };
  });
  if ('error' in result) return res.status(409).json({ error: 'already_member', fields: { email: 'This person is already in the team' } });
  res.status(201).json(result);
});

// DELETE /api/team/invites/:id — cancel a pending invite.
teamRoutes.delete('/invites/:id', requireManager, async (req, res) => {
  const { tenantId } = auth(req);
  const r = await withTenant(tenantId, (db) =>
    db.query(`DELETE FROM auth_tokens WHERE id = $1 AND tenant_id = $2 AND kind = 'invite' AND used_at IS NULL`, [req.params.id, tenantId]),
  );
  if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

async function memberRole(db: pg.PoolClient, tenantId: string, userId: string): Promise<Role | null> {
  const r = await db.query<{ role: Role }>('SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2 FOR UPDATE', [tenantId, userId]);
  return r.rows[0]?.role ?? null;
}
async function ownerCount(db: pg.PoolClient, tenantId: string) {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM memberships WHERE tenant_id = $1 AND role = 'owner'`, [tenantId]);
  return r.rows[0]!.n;
}

// PATCH /api/team/members/:userId { role }
teamRoutes.patch('/members/:userId', requireManager, async (req, res) => {
  const target = String(req.params.userId);
  if (!isUuid(target)) return res.status(404).json({ error: 'not_found' });
  const parsed = z.object({ role: z.enum(ROLES) }).safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const next = parsed.data.role;
  const me = auth(req);
  const result = await withTenant(me.tenantId, async (db) => {
    const current = await memberRole(db, me.tenantId, target);
    if (!current) return 404;
    if (me.role !== 'owner' && (current === 'owner' || next === 'owner')) return 403;
    if (current === 'owner' && next !== 'owner' && (await ownerCount(db, me.tenantId)) <= 1) return 'last_owner';
    await db.query('UPDATE memberships SET role = $3 WHERE tenant_id = $1 AND user_id = $2', [me.tenantId, target, next]);
    await writeAudit(db, { tenantId: me.tenantId, userId: me.userId, action: 'team.role_changed', entityType: 'team', entityId: target, data: { from: current, to: next } });
    return 200;
  });
  if (result === 404) return res.status(404).json({ error: 'not_found' });
  if (result === 403) return res.status(403).json({ error: 'forbidden' });
  if (result === 'last_owner') return res.status(409).json({ error: 'last_owner' });
  res.status(204).end();
});

// DELETE /api/team/members/:userId — remove someone from this business (their account stays).
teamRoutes.delete('/members/:userId', requireManager, async (req, res) => {
  const target = String(req.params.userId);
  if (!isUuid(target)) return res.status(404).json({ error: 'not_found' });
  const me = auth(req);
  const result = await withTenant(me.tenantId, async (db) => {
    const current = await memberRole(db, me.tenantId, target);
    if (!current) return 404;
    if (me.role !== 'owner' && current === 'owner') return 403;
    if (current === 'owner' && (await ownerCount(db, me.tenantId)) <= 1) return 'last_owner';
    await db.query('DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2', [me.tenantId, target]);
    // Sign them out of this business straight away.
    await db.query('DELETE FROM sessions WHERE tenant_id = $1 AND user_id = $2', [me.tenantId, target]);
    await db.query('UPDATE tasks SET assigned_to = NULL WHERE tenant_id = $1 AND assigned_to = $2', [me.tenantId, target]);
    await db.query('UPDATE appointments SET assigned_to = NULL WHERE tenant_id = $1 AND assigned_to = $2', [me.tenantId, target]);
    await writeAudit(db, { tenantId: me.tenantId, userId: me.userId, action: 'team.removed', entityType: 'team', entityId: target });
    return 204;
  });
  if (result === 404) return res.status(404).json({ error: 'not_found' });
  if (result === 403) return res.status(403).json({ error: 'forbidden' });
  if (result === 'last_owner') return res.status(409).json({ error: 'last_owner' });
  res.status(204).end();
});

// POST /api/team/members/:userId/reset-link → { link } for a team member who forgot their password.
teamRoutes.post('/members/:userId/reset-link', requireManager, async (req, res) => {
  const target = String(req.params.userId);
  if (!isUuid(target)) return res.status(404).json({ error: 'not_found' });
  const me = auth(req);
  if (target === me.userId) return res.status(409).json({ error: 'use_account_page' });
  const result = await withTenant(me.tenantId, async (db) => {
    const current = await memberRole(db, me.tenantId, target);
    if (!current) return { status: 404 as const };
    if (me.role !== 'owner' && current === 'owner') return { status: 403 as const };
    // Only for people who work in no other business: otherwise this business could take over their other account access.
    const other = await requirePool().query('SELECT 1 FROM memberships WHERE user_id = $1 AND tenant_id <> $2 LIMIT 1', [target, me.tenantId]);
    if (other.rowCount) return { status: 409 as const };
    await db.query(`DELETE FROM auth_tokens WHERE kind = 'reset' AND user_id = $1 AND used_at IS NULL`, [target]);
    const token = await createToken(db, { kind: 'reset', userId: target, createdBy: me.userId });
    await writeAudit(db, { tenantId: me.tenantId, userId: me.userId, action: 'team.reset_link', entityType: 'team', entityId: target });
    return { status: 201 as const, link: resetLink(token) };
  });
  if (result.status === 404) return res.status(404).json({ error: 'not_found' });
  if (result.status === 403) return res.status(403).json({ error: 'forbidden' });
  if (result.status === 409) return res.status(409).json({ error: 'other_businesses' });
  res.status(201).json({ link: result.link });
});
