import { Router, type Response } from 'express';
import { isoToDisplay, sgDate, sgTime } from '@mybusiness/shared';
import { withTenant } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { auth, requireAuth, requireManager } from '../../lib/auth.js';
import { getBusiness } from '../business/repo.js';

// Owners and admins can download their business's data at any time: it's theirs.
export const exportRoutes = Router();
exportRoutes.use(requireAuth, requireManager);

type Row = Record<string, unknown>;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = Array.isArray(v) ? v.join(', ') : String(v);
  // Stop spreadsheet apps treating a cell as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res: Response, filename: string, headers: string[], rows: unknown[][]) {
  const body = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + body); // BOM so Excel opens UTF-8 correctly
}

const money = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));
const d = (iso: string | null) => (iso ? isoToDisplay(iso) : '');
const dt = (t: Date | null) => (t ? `${isoToDisplay(sgDate(t))} ${sgTime(t)}` : '');

const QUERIES = {
  customers: `SELECT name, company, customer_type, phone, email, address, postal_code, status, preferred_contact, tags, notes, created_at
              FROM customers WHERE tenant_id = $1 ORDER BY name`,
  quotations: `SELECT q.number, c.name AS customer, q.title, q.issue_date, q.valid_until, q.status, q.subtotal_cents, q.discount_cents,
                 q.gst_cents, q.total_cents, q.created_at
               FROM quotations q JOIN customers c ON c.id = q.customer_id WHERE q.tenant_id = $1 ORDER BY q.issue_date, q.number`,
  appointments: `SELECT a.title, c.name AS customer, a.starts_at, a.ends_at, a.location, u.name AS assigned_to, a.status, a.notes
                 FROM appointments a LEFT JOIN customers c ON c.id = a.customer_id LEFT JOIN users u ON u.id = a.assigned_to
                 WHERE a.tenant_id = $1 ORDER BY a.starts_at`,
  tasks: `SELECT t.title, t.status, t.priority, t.due_date, u.name AS assigned_to, c.name AS customer, t.description, t.completed_at, t.created_at
          FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN customers c ON c.id = t.customer_id
          WHERE t.tenant_id = $1 ORDER BY t.created_at`,
} as const;
type Kind = keyof typeof QUERIES;

const CSV: Record<Kind, { headers: string[]; row: (r: Row) => unknown[] }> = {
  customers: {
    headers: ['Name', 'Company', 'Type', 'Phone', 'Email', 'Address', 'Postal code', 'Status', 'Preferred contact', 'Tags', 'Notes', 'Created'],
    row: (r) => [r.name, r.company, r.customer_type, r.phone, r.email, r.address, r.postal_code, r.status, r.preferred_contact, r.tags, r.notes, dt(r.created_at as Date)],
  },
  quotations: {
    headers: ['Number', 'Customer', 'Title', 'Issued', 'Valid until', 'Status', 'Subtotal (SGD)', 'Discount (SGD)', 'GST (SGD)', 'Total (SGD)', 'Created'],
    row: (r) => [r.number, r.customer, r.title, d(r.issue_date as string), d(r.valid_until as string), r.status, money(r.subtotal_cents as number), money(r.discount_cents as number), money(r.gst_cents as number), money(r.total_cents as number), dt(r.created_at as Date)],
  },
  appointments: {
    headers: ['Title', 'Customer', 'Starts', 'Ends', 'Location', 'Assigned to', 'Status', 'Notes'],
    row: (r) => [r.title, r.customer, dt(r.starts_at as Date), dt(r.ends_at as Date), r.location, r.assigned_to, r.status, r.notes],
  },
  tasks: {
    headers: ['Task', 'Status', 'Priority', 'Deadline', 'Assigned to', 'Customer', 'Notes', 'Completed', 'Created'],
    row: (r) => [r.title, r.status, r.priority, d(r.due_date as string | null), r.assigned_to, r.customer, r.description, dt(r.completed_at as Date | null), dt(r.created_at as Date)],
  },
};

// GET /api/export/customers.csv (also quotations, appointments, tasks)
exportRoutes.get('/:kind.csv', async (req, res) => {
  const kind = req.params.kind as Kind;
  if (!(kind in QUERIES)) return res.status(404).json({ error: 'not_found' });
  const { tenantId, userId } = auth(req);
  const rows = await withTenant(tenantId, async (db) => {
    const r = await db.query(QUERIES[kind], [tenantId]);
    await writeAudit(db, { tenantId, userId, action: 'data.exported', entityType: 'business', entityId: tenantId, data: { kind } });
    return r.rows;
  });
  sendCsv(res, `${kind}-${sgDate(new Date())}.csv`, CSV[kind].headers, rows.map(CSV[kind].row));
});

// GET /api/export/all.json — everything for this business in one file (a copy you can keep).
exportRoutes.get('/all.json', async (req, res) => {
  const { tenantId, userId } = auth(req);
  const data = await withTenant(tenantId, async (db) => {
    const q = async (sql: string) => (await db.query(sql, [tenantId])).rows;
    const out = {
      exportedAt: new Date().toISOString(),
      business: await getBusiness(db, tenantId),
      team: await q(`SELECT u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1`),
      customers: await q('SELECT * FROM customers WHERE tenant_id = $1 ORDER BY created_at'),
      quotations: await q('SELECT q.*, NULL AS share_token FROM quotations q WHERE tenant_id = $1 ORDER BY created_at'),
      quotationItems: await q('SELECT * FROM quotation_items WHERE tenant_id = $1 ORDER BY quotation_id, position'),
      appointments: await q('SELECT * FROM appointments WHERE tenant_id = $1 ORDER BY starts_at'),
      tasks: await q('SELECT * FROM tasks WHERE tenant_id = $1 ORDER BY created_at'),
      history: await q('SELECT action, entity_type, entity_id, data, created_at FROM audit_log WHERE tenant_id = $1 ORDER BY id'),
    };
    await writeAudit(db, { tenantId, userId, action: 'data.exported', entityType: 'business', entityId: tenantId, data: { kind: 'all' } });
    return out;
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="my-business-export-${sgDate(new Date())}.json"`);
  res.send(JSON.stringify(data, null, 2));
});
