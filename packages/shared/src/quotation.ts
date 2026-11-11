import { z } from 'zod';

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted'] as const;
export type QuoteStoredStatus = (typeof QUOTE_STATUSES)[number];
/** What the user sees: a sent quotation past its valid-until date shows as expired. */
export type QuoteStatus = QuoteStoredStatus | 'expired';
export const QUOTE_FILTERS = ['draft', 'sent', 'accepted', 'expired'] as const;

export const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
};

/** Discount choices offered in the builder, in basis points (500 = 5%). */
export const DISCOUNT_OPTIONS_BP = [0, 500, 1000] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

export const quoteItemInputSchema = z.object({
  service: z.string().trim().min(1, 'Enter a service').max(200),
  description: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => (v ? v : null)),
  quantity: z
    .number({ message: 'Enter a quantity' })
    .gt(0, 'Must be more than 0')
    .max(1_000_000)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Up to 2 decimal places'),
  unitPriceCents: z.number({ message: 'Enter a price' }).int().min(0, 'Price can’t be negative').max(100_000_000_00),
});

export const quotationInputSchema = z
  .object({
    customerId: z.string().uuid('Choose a customer'),
    title: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => (v ? v : null)),
    issueDate: isoDate,
    validUntil: isoDate,
    discountBp: z.number().int().min(0).max(10000).default(0),
    notes: z
      .string()
      .trim()
      .max(5000)
      .nullish()
      .transform((v) => (v ? v : null)),
    items: z.array(quoteItemInputSchema).min(1, 'Add at least one line item').max(200),
  })
  .refine((q) => q.validUntil >= q.issueDate, { path: ['validUntil'], message: 'Must be on or after the issue date' });

export type QuotationInput = z.input<typeof quotationInputSchema>;
export type QuotationData = z.output<typeof quotationInputSchema>;

export interface QuotationItem {
  id: string;
  service: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface QuotationSummary {
  id: string;
  number: string;
  title: string | null;
  customer: { id: string; name: string; company: string | null; phone: string | null };
  issueDate: string;
  validUntil: string;
  status: QuoteStatus;
  totalCents: number;
}

export interface Quotation extends QuotationSummary {
  customer: QuotationSummary['customer'] & { email: string | null; address: string | null; postalCode: string | null };
  discountBp: number;
  gstRegistered: boolean;
  gstRateBp: number;
  subtotalCents: number;
  discountCents: number;
  gstCents: number;
  notes: string | null;
  items: QuotationItem[];
  shareUrl: string;
  sentAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationListResponse {
  items: QuotationSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; draft: number; sent: number; accepted: number; expired: number };
  openTotalCents: number;
}

/** "2026-11-11" -> "11/11/2026" without timezone shifts. */
export function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Today's date in Singapore as "YYYY-MM-DD". */
export function todayInSingapore(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Add days to "YYYY-MM-DD". */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dollars typed by a user ("1,234.50") -> cents, or null if it isn't a valid amount. */
export function parseDollarsToCents(text: string): number | null {
  const cleaned = text.replace(/[,\sS$]/gi, '');
  if (cleaned === '' || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
