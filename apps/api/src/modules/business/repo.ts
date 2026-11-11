import type pg from 'pg';
import { GST_RATE_PERCENT } from '@mybusiness/shared';

export interface Business {
  id: string;
  name: string;
  uen: string | null;
  gstRegistered: boolean;
  gstRegNo: string | null;
  gstRateBp: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  plan: string;
  quoteValidityDays: number;
  quoteTerms: string | null;
}

export async function getBusiness(db: pg.PoolClient, tenantId: string): Promise<Business> {
  const r = await db.query(
    `SELECT id, name, uen, gst_registered, gst_reg_no, phone, email, address, plan, quote_validity_days, quote_terms
     FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const t = r.rows[0];
  if (!t) throw new Error('Business not found');
  return {
    id: t.id,
    name: t.name,
    uen: t.uen,
    gstRegistered: t.gst_registered,
    gstRegNo: t.gst_reg_no,
    gstRateBp: GST_RATE_PERCENT * 100,
    phone: t.phone,
    email: t.email,
    address: t.address,
    plan: t.plan,
    quoteValidityDays: t.quote_validity_days,
    quoteTerms: t.quote_terms,
  };
}
