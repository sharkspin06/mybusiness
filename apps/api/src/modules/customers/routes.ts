import { Router } from 'express';
import { z } from 'zod';
import {
  CUSTOMER_STATUSES,
  customerInputSchema,
  customerStatusLabel,
  isoToDisplay,
  sgDate,
  sgTime,
  type CustomerStatus,
  type Customer,
  type CustomerData,
  type CustomerListResponse,
  type HistoryEntry,
} from '@mybusiness/shared';
import { withTenant } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { auth, requireAuth } from '../../lib/auth.js';
import { isUuid, sendValidationError } from '../../lib/http.js';

export const customerRoutes = Router();
customerRoutes.use(requireAuth);

const COLUMNS = `id, name, company, customer_type, phone, email, address, postal_code, status,
  preferred_contact, tags, notes, created_at, updated_at`;

interface Row {
  id: string;
  name: string;
  company: string | null;
  customer_type: Customer['customerType'];
  phone: string | null;
  email: string | null;
  address: string | null;
  postal_code: string | null;
  status: Customer['status'];
  preferred_contact: Customer['preferredContact'];
  tags: string[];
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

const toCustomer = (r: Row): Customer => ({
  id: r.id,
  name: r.name,
  company: r.company,
  customerType: r.customer_type,
  phone: r.phone,
  email: r.email,
  address: r.address,
  postalCode: r.postal_code,
  status: r.status,
  preferredContact: r.preferred_contact,
  tags: r.tags,
  notes: r.notes,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const listQuery = z.object({
  status: z.enum(CUSTOMER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// GET /api/customers?status=lead&q=tan&page=1&pageSize=25
customerRoutes.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { status, q, page, pageSize } = parsed.data;
  const { tenantId } = auth(req);

  const result = await withTenant(tenantId, async (db) => {
    const where = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      const n = `$${params.length}`;
      // Digits-only search also matches phone numbers typed with spaces ("9123 4567").
      const digits = q.replace(/\D/g, '');
      let phoneClause = '';
      if (digits.length >= 3) {
        params.push(`%${digits}%`);
        phoneClause = ` OR phone LIKE $${params.length}`;
      }
      where.push(`(name ILIKE ${n} OR company ILIKE ${n} OR email ILIKE ${n}${phoneClause})`);
    }
    const searchWhere = where.join(' AND ');
    const counts = await db.query<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM customers WHERE ${searchWhere} GROUP BY status`,
      params,
    );
    const listWhere = status ? `${searchWhere} AND status = $${params.length + 1}` : searchWhere;
    const listParams = status ? [...params, status] : params;
    const rows = await db.query<Row & { total: number }>(
      `SELECT ${COLUMNS}, count(*) OVER ()::int AS total FROM customers
       WHERE ${listWhere}
       ORDER BY updated_at DESC, id
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      listParams,
    );
    const c = { all: 0, lead: 0, active: 0, inactive: 0 };
    for (const r of counts.rows) {
      c[r.status as keyof typeof c] = r.n;
      c.all += r.n;
    }
    const body: CustomerListResponse = {
      items: rows.rows.map(toCustomer),
      total: rows.rows[0]?.total ?? 0,
      page,
      pageSize,
      counts: c,
    };
    return body;
  });
  res.json(result);
});

// GET /api/customers/:id
customerRoutes.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId } = auth(req);
  const row = await withTenant(tenantId, async (db) => {
    const r = await db.query<Row>(`SELECT ${COLUMNS} FROM customers WHERE tenant_id = $1 AND id = $2`, [tenantId, req.params.id]);
    return r.rows[0];
  });
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json(toCustomer(row));
});

// POST /api/customers
customerRoutes.post('/', async (req, res) => {
  const parsed = customerInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);
  const customer = await withTenant(tenantId, async (db) => {
    const r = await db.query<Row>(
      `INSERT INTO customers (tenant_id, name, company, customer_type, phone, email, address, postal_code,
         status, preferred_contact, tags, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${COLUMNS}`,
      [tenantId, d.name, d.company, d.customerType, d.phone, d.email, d.address, d.postalCode, d.status, d.preferredContact, d.tags, d.notes, userId],
    );
    const c = toCustomer(r.rows[0]!);
    await writeAudit(db, { tenantId, userId, action: 'customer.created', entityType: 'customer', entityId: c.id });
    return c;
  });
  res.status(201).json(customer);
});

const fieldLabels: Record<keyof CustomerData, string> = {
  name: 'name',
  company: 'company',
  customerType: 'customer type',
  phone: 'phone',
  email: 'email',
  address: 'address',
  postalCode: 'postal code',
  status: 'status',
  preferredContact: 'preferred contact',
  tags: 'tags',
  notes: 'notes',
};

// PUT /api/customers/:id  (full update from the edit form)
customerRoutes.put('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const parsed = customerInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);
  const customer = await withTenant(tenantId, async (db) => {
    const before = await db.query<Row>(`SELECT ${COLUMNS} FROM customers WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, req.params.id]);
    if (!before.rows[0]) return null;
    const old = toCustomer(before.rows[0]);
    const r = await db.query<Row>(
      `UPDATE customers SET name = $3, company = $4, customer_type = $5, phone = $6, email = $7, address = $8,
         postal_code = $9, status = $10, preferred_contact = $11, tags = $12, notes = $13, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${COLUMNS}`,
      [tenantId, req.params.id, d.name, d.company, d.customerType, d.phone, d.email, d.address, d.postalCode, d.status, d.preferredContact, d.tags, d.notes],
    );
    const changed = (Object.keys(fieldLabels) as (keyof CustomerData)[]).filter(
      (k) => JSON.stringify(old[k]) !== JSON.stringify(d[k]),
    );
    if (changed.length) {
      const data: Record<string, unknown> = { fields: changed };
      if (changed.includes('status')) data.status = { from: old.status, to: d.status };
      await writeAudit(db, { tenantId, userId, action: 'customer.updated', entityType: 'customer', entityId: old.id, data });
    }
    return toCustomer(r.rows[0]!);
  });
  if (!customer) return res.status(404).json({ error: 'not_found' });
  res.json(customer);
});

// DELETE /api/customers/:id  (owners and admins only)
customerRoutes.delete('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId, userId, role } = auth(req);
  if (role === 'staff') return res.status(403).json({ error: 'forbidden' });
  const deleted = await withTenant(tenantId, async (db) => {
    const quotes = await db.query('SELECT 1 FROM quotations WHERE tenant_id = $1 AND customer_id = $2 LIMIT 1', [tenantId, req.params.id]);
    if (quotes.rowCount) return 'has_quotations' as const;
    const r = await db.query<{ name: string }>('DELETE FROM customers WHERE tenant_id = $1 AND id = $2 RETURNING name', [tenantId, req.params.id]);
    if (!r.rows[0]) return false;
    await writeAudit(db, { tenantId, userId, action: 'customer.deleted', entityType: 'customer', entityId: req.params.id, data: { name: r.rows[0].name } });
    return true;
  });
  if (deleted === 'has_quotations') return res.status(409).json({ error: 'has_quotations' });
  if (!deleted) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

function describe(action: string, data: Record<string, unknown>): string {
  switch (action) {
    case 'customer.created':
      return 'Customer created';
    case 'customer.updated': {
      const status = data.status as { from: string; to: string } | undefined;
      if (status) {
        const label = (s: string) => customerStatusLabel[s as CustomerStatus] ?? s;
        return `Status changed from ${label(status.from)} to ${label(status.to)}`;
      }
      const fields = ((data.fields as (keyof CustomerData)[] | undefined) ?? []).map((f) => fieldLabels[f] ?? f);
      return fields.length ? `Updated ${fields.join(', ')}` : 'Details updated';
    }
    default: {
      const quoteVerbs: Record<string, string> = {
        'quotation.created': 'created',
        'quotation.updated': 'updated',
        'quotation.sent': 'sent',
        'quotation.accepted': 'accepted',
        'quotation.reopened': 'moved back to draft',
        'quotation.deleted': 'deleted',
      };
      const verb = quoteVerbs[action];
      if (verb) return `Quotation ${String(data.number ?? '')} ${verb}`;
      const apptVerbs: Record<string, string> = {
        'appointment.created': 'booked',
        'appointment.updated': 'updated',
        'appointment.rescheduled': 'rescheduled to',
        'appointment.completed': 'completed',
        'appointment.cancelled': 'cancelled',
        'appointment.deleted': 'deleted',
      };
      const av = apptVerbs[action];
      if (av) {
        const when = typeof data.startsAt === 'string' ? `${isoToDisplay(sgDate(data.startsAt))} ${sgTime(data.startsAt)}` : '';
        return `Appointment ${av}: ${String(data.title ?? '')}${when ? `, ${when}` : ''}`.replace('rescheduled to:', 'rescheduled:');
      }
      const taskVerbs: Record<string, string> = {
        'task.created': 'Task added',
        'task.updated': 'Task updated',
        'task.completed': 'Task completed',
        'task.reopened': 'Task reopened',
        'task.deleted': 'Task deleted',
      };
      if (taskVerbs[action]) return `${taskVerbs[action]}: ${String(data.title ?? '')}`;
      return action;
    }
  }
}

// GET /api/customers/:id/summary — figures for the profile's stat cards.
customerRoutes.get('/:id/summary', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId } = auth(req);
  const row = await withTenant(tenantId, async (db) => {
    const r = await db.query<{ quoted: number; accepted: number; n: number }>(
      `SELECT coalesce(sum(total_cents) FILTER (WHERE status <> 'draft'), 0)::bigint AS quoted,
              coalesce(sum(total_cents) FILTER (WHERE status = 'accepted'), 0)::bigint AS accepted,
              count(*)::int AS n
       FROM quotations WHERE tenant_id = $1 AND customer_id = $2`,
      [tenantId, req.params.id],
    );
    const next = await db.query<{ starts_at: Date; title: string }>(
      `SELECT starts_at, title FROM appointments
       WHERE tenant_id = $1 AND customer_id = $2 AND starts_at >= now() AND status IN ('pending', 'confirmed')
       ORDER BY starts_at LIMIT 1`,
      [tenantId, req.params.id],
    );
    return { ...r.rows[0]!, next: next.rows[0] ?? null };
  });
  res.json({
    quotedCents: row.quoted,
    acceptedCents: row.accepted,
    quotationCount: row.n,
    nextAppointment: row.next ? { startsAt: row.next.starts_at.toISOString(), title: row.next.title } : null,
  });
});

// GET /api/customers/:id/history
customerRoutes.get('/:id/history', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId } = auth(req);
  const rows = await withTenant(tenantId, async (db) => {
    const r = await db.query<{ id: number; action: string; data: Record<string, unknown>; user_name: string | null; created_at: Date }>(
      `SELECT a.id, a.action, a.data, u.name AS user_name, a.created_at
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = $1
         AND ((a.entity_type = 'customer' AND a.entity_id = $2)
           OR (a.entity_type IN ('quotation', 'appointment', 'task') AND a.data->>'customerId' = $2::text))
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 200`,
      [tenantId, req.params.id],
    );
    return r.rows;
  });
  const items: HistoryEntry[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    summary: describe(r.action, r.data),
    userName: r.user_name,
    createdAt: r.created_at.toISOString(),
  }));
  res.json({ items });
});
