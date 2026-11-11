import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { appointmentInputSchema, appointmentTimeSchema, type Appointment, type AppointmentData } from '@mybusiness/shared';
import { withTenant } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { auth, requireAuth } from '../../lib/auth.js';
import { isUuid, sendValidationError } from '../../lib/http.js';

export const appointmentRoutes = Router();
appointmentRoutes.use(requireAuth);

const SELECT = `SELECT a.id, a.title, a.customer_id, a.starts_at, a.ends_at, a.location, a.assigned_to, a.status, a.notes,
    a.reminders, a.created_at, a.updated_at, c.name AS c_name, c.phone AS c_phone, u.name AS u_name
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id AND c.tenant_id = a.tenant_id
  LEFT JOIN users u ON u.id = a.assigned_to`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toAppointment = (r: any): Appointment => ({
  id: r.id,
  title: r.title,
  customerId: r.customer_id,
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at.toISOString(),
  location: r.location,
  assignedTo: r.assigned_to,
  status: r.status,
  notes: r.notes,
  reminders: r.reminders,
  customer: r.customer_id ? { id: r.customer_id, name: r.c_name, phone: r.c_phone } : null,
  assignee: r.assigned_to ? { id: r.assigned_to, name: r.u_name } : null,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

async function load(db: pg.PoolClient, tenantId: string, id: string) {
  const r = await db.query(`${SELECT} WHERE a.tenant_id = $1 AND a.id = $2`, [tenantId, id]);
  return r.rows[0] ? toAppointment(r.rows[0]) : null;
}

/** The customer and assignee must belong to this business. Returns field errors, or null if fine. */
async function checkRefs(db: pg.PoolClient, tenantId: string, d: Pick<AppointmentData, 'customerId' | 'assignedTo'>) {
  const fields: Record<string, string> = {};
  if (d.customerId) {
    const c = await db.query('SELECT 1 FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, d.customerId]);
    if (!c.rowCount) fields.customerId = 'Choose a customer';
  }
  if (d.assignedTo) {
    const m = await db.query('SELECT 1 FROM memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, d.assignedTo]);
    if (!m.rowCount) fields.assignedTo = 'Choose someone in this business';
  }
  return Object.keys(fields).length ? fields : null;
}

const listQuery = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    customerId: z.string().uuid().optional(),
  })
  .refine((q) => q.customerId || (q.from && q.to), 'Give from and to, or a customerId')
  .refine((q) => !q.from || !q.to || Date.parse(q.to) - Date.parse(q.from) <= 62 * 86400000, 'Range can be at most 62 days');

// GET /api/appointments?from=ISO&to=ISO   (calendar range)
// GET /api/appointments?customerId=…      (a customer's appointments, newest first)
appointmentRoutes.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { from, to, customerId } = parsed.data;
  const { tenantId } = auth(req);
  const items = await withTenant(tenantId, async (db) => {
    const where = ['a.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (from && to) {
      params.push(to, from);
      where.push(`a.starts_at < $${params.length - 1} AND a.ends_at > $${params.length}`); // overlaps the range
    }
    if (customerId) {
      params.push(customerId);
      where.push(`a.customer_id = $${params.length}`);
    }
    const order = from && to ? 'a.starts_at, a.ends_at' : 'a.starts_at DESC';
    const r = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 1000`, params);
    return r.rows.map(toAppointment);
  });
  res.json({ items });
});

appointmentRoutes.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId } = auth(req);
  const a = await withTenant(tenantId, (db) => load(db, tenantId, req.params.id));
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json(a);
});

const auditData = (a: Pick<Appointment, 'title' | 'startsAt' | 'customerId'>, extra: Record<string, unknown> = {}) => ({
  title: a.title,
  startsAt: a.startsAt,
  customerId: a.customerId,
  ...extra,
});

// POST /api/appointments
appointmentRoutes.post('/', async (req, res) => {
  const parsed = appointmentInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);
  const result = await withTenant(tenantId, async (db) => {
    const bad = await checkRefs(db, tenantId, d);
    if (bad) return { fields: bad };
    const r = await db.query<{ id: string }>(
      `INSERT INTO appointments (tenant_id, customer_id, title, starts_at, ends_at, location, assigned_to, status, notes, reminders, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [tenantId, d.customerId, d.title, d.startsAt, d.endsAt, d.location, d.assignedTo, d.status, d.notes, JSON.stringify(d.reminders), userId],
    );
    const a = (await load(db, tenantId, r.rows[0]!.id))!;
    await writeAudit(db, { tenantId, userId, action: 'appointment.created', entityType: 'appointment', entityId: a.id, data: auditData(a) });
    return { a };
  });
  if ('fields' in result) return res.status(400).json({ error: 'validation', fields: result.fields });
  res.status(201).json(result.a);
});

// PUT /api/appointments/:id — full edit from the form.
appointmentRoutes.put('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const parsed = appointmentInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);
  const result = await withTenant(tenantId, async (db) => {
    const before = await load(db, tenantId, req.params.id);
    if (!before) return { status: 404 as const };
    const bad = await checkRefs(db, tenantId, d);
    if (bad) return { fields: bad };
    await db.query(
      `UPDATE appointments SET customer_id = $3, title = $4, starts_at = $5, ends_at = $6, location = $7, assigned_to = $8,
         status = $9, notes = $10, reminders = $11, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, req.params.id, d.customerId, d.title, d.startsAt, d.endsAt, d.location, d.assignedTo, d.status, d.notes, JSON.stringify(d.reminders)],
    );
    const a = (await load(db, tenantId, req.params.id))!;
    const moved = before.startsAt !== a.startsAt || before.endsAt !== a.endsAt;
    const action =
      before.status !== a.status && (a.status === 'cancelled' || a.status === 'completed')
        ? `appointment.${a.status}`
        : moved
          ? 'appointment.rescheduled'
          : 'appointment.updated';
    await writeAudit(db, { tenantId, userId, action, entityType: 'appointment', entityId: a.id, data: auditData(a, moved ? { from: before.startsAt } : {}) });
    return { a };
  });
  if ('status' in result) return res.status(404).json({ error: 'not_found' });
  if ('fields' in result) return res.status(400).json({ error: 'validation', fields: result.fields });
  res.json(result.a);
});

// PATCH /api/appointments/:id/time { startsAt, endsAt } — drag to reschedule.
appointmentRoutes.patch('/:id/time', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const parsed = appointmentTimeSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { tenantId, userId } = auth(req);
  const a = await withTenant(tenantId, async (db) => {
    const before = await load(db, tenantId, req.params.id);
    if (!before) return null;
    await db.query('UPDATE appointments SET starts_at = $3, ends_at = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2', [
      tenantId,
      req.params.id,
      parsed.data.startsAt,
      parsed.data.endsAt,
    ]);
    const after = (await load(db, tenantId, req.params.id))!;
    await writeAudit(db, { tenantId, userId, action: 'appointment.rescheduled', entityType: 'appointment', entityId: after.id, data: auditData(after, { from: before.startsAt }) });
    return after;
  });
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json(a);
});

// DELETE /api/appointments/:id
appointmentRoutes.delete('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId, userId } = auth(req);
  const ok = await withTenant(tenantId, async (db) => {
    const before = await load(db, tenantId, req.params.id);
    if (!before) return false;
    await db.query('DELETE FROM appointments WHERE tenant_id = $1 AND id = $2', [tenantId, req.params.id]);
    await writeAudit(db, { tenantId, userId, action: 'appointment.deleted', entityType: 'appointment', entityId: before.id, data: auditData(before) });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
