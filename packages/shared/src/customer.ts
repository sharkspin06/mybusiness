import { z } from 'zod';

export const CUSTOMER_STATUSES = ['lead', 'active', 'inactive'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_TYPES = ['individual', 'business'] as const;
export const CONTACT_METHODS = ['whatsapp', 'phone', 'email'] as const;

export const customerStatusLabel: Record<CustomerStatus, string> = {
  lead: 'Lead',
  active: 'Active',
  inactive: 'Inactive',
};

/**
 * Normalise a phone number for storage. Singapore numbers (8 digits, with or without +65)
 * become "+6591234567". Other international numbers keep their + and digits.
 * Returns null for empty input and undefined if it is not a usable number.
 */
export function normalizePhone(raw: string | null | undefined): string | null | undefined {
  if (raw == null || raw.trim() === '') return null;
  const hasPlus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!hasPlus && digits.length === 8) return '+65' + digits;
  if (digits.length === 10 && digits.startsWith('65')) return '+' + digits;
  if (hasPlus && digits.length >= 8 && digits.length <= 15) return '+' + digits;
  return undefined;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Fields accepted when creating or editing a customer (shared by the form and the API). */
export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  company: optionalText(200),
  customerType: z.enum(CUSTOMER_TYPES).default('individual'),
  phone: z
    .string()
    .nullish()
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (n === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Enter an 8-digit Singapore number, or an international number starting with +' });
        return z.NEVER;
      }
      return n;
    }),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
  address: optionalText(300),
  postalCode: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{6}$/.test(v), 'Singapore postal codes have 6 digits'),
  status: z.enum(CUSTOMER_STATUSES).default('active'),
  preferredContact: z.enum(CONTACT_METHODS).default('whatsapp'),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .default([])
    .transform((t) => [...new Set(t)]),
  notes: optionalText(5000),
});

export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerData = z.output<typeof customerInputSchema>;

/** A customer as returned by the API. */
export interface Customer extends CustomerData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
  counts: { all: number; lead: number; active: number; inactive: number };
}

export interface HistoryEntry {
  id: number;
  action: string;
  summary: string;
  userName: string | null;
  createdAt: string;
}
