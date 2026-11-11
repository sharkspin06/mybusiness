import { Router } from 'express';
import { pool, withTenant } from '../../db/pool.js';
import { getBusiness } from '../business/repo.js';
import { renderQuotationPdf } from './pdf.js';
import { loadQuotation } from './repo.js';

// Public link a customer opens from WhatsApp. No sign-in: the long random token is the key.
export const publicQuotationRoutes = Router();

publicQuotationRoutes.get('/:token.pdf', async (req, res) => {
  const token = req.params.token;
  if (!pool || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) return res.status(404).send('Not found');
  const found = await pool.query<{ tenant_id: string }>(
    // Drafts are never public, even if someone has the link.
    "SELECT tenant_id FROM quotations WHERE share_token = $1 AND status <> 'draft'",
    [token],
  );
  const tenantId = found.rows[0]?.tenant_id;
  if (!tenantId) return res.status(404).send('This quotation is not available.');
  const data = await withTenant(tenantId, async (db) => {
    const quote = await loadQuotation(db, tenantId, { shareToken: token });
    return quote ? { quote, business: await getBusiness(db, tenantId) } : null;
  });
  if (!data) return res.status(404).send('This quotation is not available.');
  const pdf = await renderQuotationPdf(data.quote, data.business);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${data.quote.number}.pdf"`);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});
