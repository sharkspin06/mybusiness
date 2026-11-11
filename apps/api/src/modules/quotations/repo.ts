import type pg from 'pg';
import type { Quotation, QuotationItem, QuoteStatus } from '@mybusiness/shared';
import { config } from '../../config.js';

/** SQL for the status users see: a sent quotation past valid_until is 'expired'. */
export const DISPLAY_STATUS = `CASE WHEN q.status = 'sent' AND q.valid_until < (now() AT TIME ZONE 'Asia/Singapore')::date
  THEN 'expired' ELSE q.status END`;

export const shareUrl = (token: string) => `${config.publicUrl}/api/public/quotations/${token}.pdf`;

// DATE columns arrive as "YYYY-MM-DD" strings (see db/pool.ts).
const isoDate = (d: string) => d.slice(0, 10);

/** Load one quotation with its customer and items. `where` picks it by id or by share token. */
export async function loadQuotation(
  db: pg.PoolClient,
  tenantId: string,
  by: { id: string } | { shareToken: string },
): Promise<Quotation | null> {
  const [col, val] = 'id' in by ? ['q.id', by.id] : ['q.share_token', by.shareToken];
  const r = await db.query(
    `SELECT q.*, ${DISPLAY_STATUS} AS display_status,
            c.name AS c_name, c.company AS c_company, c.phone AS c_phone, c.email AS c_email,
            c.address AS c_address, c.postal_code AS c_postal
     FROM quotations q JOIN customers c ON c.id = q.customer_id AND c.tenant_id = q.tenant_id
     WHERE q.tenant_id = $1 AND ${col} = $2`,
    [tenantId, val],
  );
  const q = r.rows[0];
  if (!q) return null;
  const items = await db.query(
    `SELECT id, service, description, quantity, unit_price_cents, amount_cents
     FROM quotation_items WHERE tenant_id = $1 AND quotation_id = $2 ORDER BY position`,
    [tenantId, q.id],
  );
  return {
    id: q.id,
    number: q.number,
    title: q.title,
    customer: {
      id: q.customer_id,
      name: q.c_name,
      company: q.c_company,
      phone: q.c_phone,
      email: q.c_email,
      address: q.c_address,
      postalCode: q.c_postal,
    },
    issueDate: isoDate(q.issue_date),
    validUntil: isoDate(q.valid_until),
    status: q.display_status as QuoteStatus,
    discountBp: q.discount_bp,
    gstRegistered: q.gst_registered,
    gstRateBp: q.gst_rate_bp,
    subtotalCents: q.subtotal_cents,
    discountCents: q.discount_cents,
    gstCents: q.gst_cents,
    totalCents: q.total_cents,
    notes: q.notes,
    items: items.rows.map(
      (i): QuotationItem => ({
        id: i.id,
        service: i.service,
        description: i.description,
        quantity: Number(i.quantity),
        unitPriceCents: i.unit_price_cents,
        amountCents: i.amount_cents,
      }),
    ),
    shareUrl: shareUrl(q.share_token),
    sentAt: q.sent_at?.toISOString() ?? null,
    acceptedAt: q.accepted_at?.toISOString() ?? null,
    createdAt: q.created_at.toISOString(),
    updatedAt: q.updated_at.toISOString(),
  };
}
