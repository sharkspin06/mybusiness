import { Router } from 'express';
import { businessSettingsSchema } from '@mybusiness/shared';
import { withTenant } from '../../db/pool.js';
import { writeAudit } from '../../lib/audit.js';
import { auth, requireAuth, requireManager } from '../../lib/auth.js';
import { sendValidationError } from '../../lib/http.js';
import { getBusiness } from './repo.js';

export const businessRoutes = Router();
businessRoutes.use(requireAuth);

// GET /api/business — the current business's details (name, UEN, GST, quotation defaults).
businessRoutes.get('/', async (req, res) => {
  const { tenantId } = auth(req);
  res.json(await withTenant(tenantId, (db) => getBusiness(db, tenantId)));
});

// PUT /api/business — owners and admins.
businessRoutes.put('/', requireManager, async (req, res) => {
  const parsed = businessSettingsSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const d = parsed.data;
  const { tenantId, userId } = auth(req);
  const biz = await withTenant(tenantId, async (db) => {
    await db.query(
      `UPDATE tenants SET name = $2, uen = $3, gst_registered = $4, gst_reg_no = $5, phone = $6, email = $7, address = $8,
         quote_validity_days = $9, quote_terms = $10, updated_at = now()
       WHERE id = $1`,
      [tenantId, d.name, d.uen, d.gstRegistered, d.gstRegistered ? d.gstRegNo : null, d.phone, d.email, d.address, d.quoteValidityDays, d.quoteTerms],
    );
    await writeAudit(db, { tenantId, userId, action: 'business.updated', entityType: 'business', entityId: tenantId });
    return getBusiness(db, tenantId);
  });
  res.json(biz);
});

// GET /api/business/members — people in this business (for "Assigned to" pickers).
businessRoutes.get('/members', async (req, res) => {
  const { tenantId } = auth(req);
  const rows = await withTenant(tenantId, async (db) => {
    const r = await db.query<{ id: string; name: string; role: string }>(
      `SELECT u.id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = $1 ORDER BY u.name`,
      [tenantId],
    );
    return r.rows;
  });
  res.json({ items: rows });
});
