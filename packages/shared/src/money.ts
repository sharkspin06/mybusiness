// Money is stored and calculated in cents (integers) to avoid floating-point errors.

export const GST_RATE_PERCENT = 9;

export interface LineItem {
  quantity: number;
  unitPriceCents: number;
}

export interface QuoteTotals {
  subtotalCents: number;
  discountCents: number;
  gstCents: number;
  totalCents: number;
}

/** GST is charged on (subtotal − discount), only when the business is GST-registered. */
export function calculateTotals(
  lines: LineItem[],
  discountPercent: number,
  gstRegistered: boolean,
  gstRatePercent = GST_RATE_PERCENT,
): QuoteTotals {
  const subtotalCents = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceCents), 0);
  const discountCents = Math.round((subtotalCents * discountPercent) / 100);
  const taxable = subtotalCents - discountCents;
  const gstCents = gstRegistered ? Math.round((taxable * gstRatePercent) / 100) : 0;
  return { subtotalCents, discountCents, gstCents, totalCents: taxable + gstCents };
}

export const centsToDollars = (cents: number): number => cents / 100;
