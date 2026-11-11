import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import {
  QUOTE_FILTERS,
  calculateTotals,
  quotationInputSchema,
  type QuotationData,
  type QuotationListResponse,
  type QuotationSummary,
  type QuoteStatus,
} from '@mybusiness/shared';
import { withTenant } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { auth, requireAuth } from '../../lib/auth.js';
import { isUuid, sendValidationError } from '../../lib/http.js';
import { getBusiness } from '../business/repo.js';
import { DISPLAY_STATUS, loadQuotation } from './repo.js';
import { renderQuotationPdf } from './pdf.js';

export const quotationRoutes = Router();
quotationRoutes.use(requireAuth);

const listQuery = z.object({
  status: z.enum(QUOTE_FILTERS).optional(),
  customerId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// GET /api/quotations?status=sent&customerId=…&q=…&page=1
quotationRoutes.get('/', async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { status, customerId, q, page, pageSize } = parsed.data;
  const { tenantId } = auth(req);

  const body = await withTenant(tenantId, async (db) => {
    const where = ['q.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (customerId) {
      params.push(customerId);
      where.push(`q.customer_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      const n = `$${params.length}`;
      where.push(`(q.number ILIKE ${n} OR q.title ILIKE ${n} OR c.name ILIKE ${n} OR c.company ILIKE ${n})`);
    }
    const base = `FROM quotations q JOIN customers c ON c.id = q.customer_id AND c.tenant_id = q.tenant_id WHERE ${where.join(' AND ')}`;
    const counts = await db.query<{ s: QuoteStatus; n: number; total: number }>(
      `SELECT ${DISPLAY_STATUS} AS s, count(*)::int AS n, coalesce(sum(q.total_cents), 0)::bigint AS total ${base} GROUP BY 1`,
      params,
    );
    const listParams = status ? [...params, status] : params;
    const statusClause = status ? ` AND ${DISPLAY_STATUS} = $${listParams.length}` : '';
    const rows = await db.query(
      `SELECT q.id, q.number, q.title, q.issue_date, q.valid_until, q.total_cents, ${DISPLAY_STATUS} AS display_status,
              c.id AS c_id, c.name AS c_name, c.company AS c_company, c.phone AS c_phone,
              count(*) OVER ()::int AS full_count
       ${base}${statusClause}
       ORDER BY q.issue_date DESC, q.number DESC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      listParams,
    );
    const c = { all: 0, draft: 0, sent: 0, accepted: 0, expired: 0 };
    let openTotalCents = 0;
    for (const r of counts.rows) {
      c[r.s] = r.n;
      c.all += r.n;
      if (r.s === 'sent') openTotalCents = r.total;
    }
    const out: QuotationListResponse = {
      items: rows.rows.map(
        (r): QuotationSummary => ({
          id: r.id,
          number: r.number,
          title: r.title,
          customer: { id: r.c_id, name: r.c_name, company: r.c_company, phone: r.c_phone },
          issueDate: r.issue_date,
          validUntil: r.valid_until,
          status: r.display_status,
          totalCents: r.total_cents,
        }),
      ),
      total: rows.rows[0]?.full_count ?? 0,
      page,
      pageSize,
      counts: c,
      openTotalCents,
    };
    return out;
  });
  res.json(body);
});

// GET /api/quotations/:id
quotationRoutes.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId } = auth(req);
  const quote = await withTenant(tenantId, (db) => loadQuotation(db, tenantId, { id: req.params.id }));
  if (!quote) return res.status(404).json({ error: 'not_found' });
  res.json(quote);
});

// GET /api/quotations/:id/pdf
quotationRoutes.get('/:id/pdf', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId } = auth(req);
  const result = await withTenant(tenantId, async (db) => {
    const quote = await loadQuotation(db, tenantId, { id: req.params.id });
    return quote ? { quote, business: await getBusiness(db, tenantId) } : null;
  });
  if (!result) return res.status(404).json({ error: 'not_found' });
  const pdf = await renderQuotationPdf(result.quote, result.business);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${result.quote.number}.pdf"`);
  res.send(pdf);
});

/** Work out totals on the server (never trust totals sent by the browser). */
function computeTotals(d: QuotationData, gstRegistered: boolean, gstRateBp: number) {
  const totals = calculateTotals(d.items, d.discountBp / 100, gstRegistered, gstRateBp / 100);
  const amounts = d.items.map((i) => Math.round(i.quantity * i.unitPriceCents));
  return { totals, amounts };
}

async function customerExists(db: pg.PoolClient, tenantId: string, customerId: string) {
  const r = await db.query('SELECT 1 FROM customers WHERE tenant_id = $1 AND id = $2', [tenantId, customerId]);
  return r.rowCount === 1;
}

async function insertItems(db: pg.PoolClient, tenantId: string, quotationId: string, d: QuotationData, amounts: number[]) {
  for (const [idx, item] of d.items.entries()) {
    await db.query(
      `INSERT INTO quotation_items (tenant_id, quotation_id, position, service, description, quantity, unit_price_cents, amount_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, quotationId, idx + 1, item.service, item.description, item.quantity, item.unitPriceCents, amounts[idx]],
    );
  }
}

// POST /api/quotations — creates a draft with the next number for its issue year.
quotationRoutes.post('/', async (req, res) => {
  const parsed = quotationInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);

  const result = await withTenant(tenantId, async (db) => {
    if (!(await customerExists(db, tenantId, d.customerId))) return { error: 'customer' as const };
    const biz = await getBusiness(db, tenantId);
    const { totals, amounts } = computeTotals(d, biz.gstRegistered, biz.gstRateBp);
    const year = Number(d.issueDate.slice(0, 4));
    const seq = await db.query<{ last_value: number }>(
      `INSERT INTO quote_sequences (tenant_id, year, last_value) VALUES ($1, $2, 1)
       ON CONFLICT (tenant_id, year) DO UPDATE SET last_value = quote_sequences.last_value + 1
       RETURNING last_value`,
      [tenantId, year],
    );
    const number = `Q-${year}-${String(seq.rows[0]!.last_value).padStart(4, '0')}`;
    const ins = await db.query<{ id: string }>(
      `INSERT INTO quotations (tenant_id, customer_id, number, title, issue_date, valid_until, discount_bp,
         gst_registered, gst_rate_bp, subtotal_cents, discount_cents, gst_cents, total_cents, notes, share_token, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [tenantId, d.customerId, number, d.title, d.issueDate, d.validUntil, d.discountBp, biz.gstRegistered, biz.gstRateBp,
        totals.subtotalCents, totals.discountCents, totals.gstCents, totals.totalCents, d.notes,
        randomBytes(18).toString('base64url'), userId],
    );
    const id = ins.rows[0]!.id;
    await insertItems(db, tenantId, id, d, amounts);
    await writeAudit(db, { tenantId, userId, action: 'quotation.created', entityType: 'quotation', entityId: id, data: { number, customerId: d.customerId } });
    return { quote: await loadQuotation(db, tenantId, { id }) };
  });
  if ('error' in result) return res.status(400).json({ error: 'validation', fields: { customerId: 'Choose a customer' } });
  res.status(201).json(result.quote);
});

// PUT /api/quotations/:id — replace details and line items. Accepted quotations are locked.
quotationRoutes.put('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const parsed = quotationInputSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);

  const result = await withTenant(tenantId, async (db) => {
    const cur = await db.query<{ status: string; number: string; gst_registered: boolean; gst_rate_bp: number }>(
      'SELECT status, number, gst_registered, gst_rate_bp FROM quotations WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, req.params.id],
    );
    const row = cur.rows[0];
    if (!row) return { status: 404 as const };
    if (row.status === 'accepted') return { status: 409 as const, error: 'locked' };
    if (!(await customerExists(db, tenantId, d.customerId))) return { status: 400 as const };
    // Keep the GST setting the quotation was created with.
    const { totals, amounts } = computeTotals(d, row.gst_registered, row.gst_rate_bp);
    await db.query(
      `UPDATE quotations SET customer_id = $3, title = $4, issue_date = $5, valid_until = $6, discount_bp = $7,
         subtotal_cents = $8, discount_cents = $9, gst_cents = $10, total_cents = $11, notes = $12, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, req.params.id, d.customerId, d.title, d.issueDate, d.validUntil, d.discountBp,
        totals.subtotalCents, totals.discountCents, totals.gstCents, totals.totalCents, d.notes],
    );
    await db.query('DELETE FROM quotation_items WHERE tenant_id = $1 AND quotation_id = $2', [tenantId, req.params.id]);
    await insertItems(db, tenantId, req.params.id, d, amounts);
    await writeAudit(db, { tenantId, userId, action: 'quotation.updated', entityType: 'quotation', entityId: req.params.id, data: { number: row.number, customerId: d.customerId } });
    return { status: 200 as const, quote: await loadQuotation(db, tenantId, { id: req.params.id }) };
  });
  if (result.status === 404) return res.status(404).json({ error: 'not_found' });
  if (result.status === 409) return res.status(409).json({ error: 'locked' });
  if (result.status === 400) return res.status(400).json({ error: 'validation', fields: { customerId: 'Choose a customer' } });
  res.json(result.quote);
});

const statusBody = z.object({ status: z.enum(['draft', 'sent', 'accepted']) });
const allowed: Record<string, string[]> = { draft: ['sent'], sent: ['accepted', 'draft'], accepted: ['sent'] };

// POST /api/quotations/:id/status { status: 'sent' | 'accepted' | 'draft' }
quotationRoutes.post('/:id/status', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const parsed = statusBody.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const next = parsed.data.status;
  const { tenantId, userId } = auth(req);

  const result = await withTenant(tenantId, async (db) => {
    const cur = await db.query<{ status: string; number: string; customer_id: string }>(
      'SELECT status, number, customer_id FROM quotations WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, req.params.id],
    );
    const row = cur.rows[0];
    if (!row) return { status: 404 as const };
    if (row.status !== next) {
      if (!allowed[row.status]?.includes(next)) return { status: 409 as const };
      await db.query(
        `UPDATE quotations SET status = $3, updated_at = now(),
           sent_at = CASE WHEN $3 = 'sent' THEN coalesce(sent_at, now()) ELSE sent_at END,
           accepted_at = CASE WHEN $3 = 'accepted' THEN now() WHEN $3 <> 'accepted' THEN NULL ELSE accepted_at END
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, req.params.id, next],
      );
      await writeAudit(db, { tenantId, userId, action: `quotation.${next === 'draft' ? 'reopened' : next}`, entityType: 'quotation', entityId: req.params.id, data: { number: row.number, customerId: row.customer_id } });
    }
    return { status: 200 as const, quote: await loadQuotation(db, tenantId, { id: req.params.id }) };
  });
  if (result.status === 404) return res.status(404).json({ error: 'not_found' });
  if (result.status === 409) return res.status(409).json({ error: 'invalid_status' });
  res.json(result.quote);
});

// DELETE /api/quotations/:id — drafts only.
quotationRoutes.delete('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const { tenantId, userId } = auth(req);
  const result = await withTenant(tenantId, async (db) => {
    const r = await db.query<{ status: string; number: string; customer_id: string }>(
      'SELECT status, number, customer_id FROM quotations WHERE tenant_id = $1 AND id = $2 FOR UPDATE',
      [tenantId, req.params.id],
    );
    const row = r.rows[0];
    if (!row) return 404;
    if (row.status !== 'draft') return 409;
    await db.query('DELETE FROM quotations WHERE tenant_id = $1 AND id = $2', [tenantId, req.params.id]);
    await writeAudit(db, { tenantId, userId, action: 'quotation.deleted', entityType: 'quotation', entityId: req.params.id, data: { number: row.number, customerId: row.customer_id } });
    return 204;
  });
  if (result === 404) return res.status(404).json({ error: 'not_found' });
  if (result === 409) return res.status(409).json({ error: 'not_draft' });
  res.status(204).end();
});
