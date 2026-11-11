import { z } from 'zod';
import { PASSWORD_MIN, ROLES, type Role } from './auth';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Business profile and quotation defaults (Settings). */
export const businessSettingsSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the business name').max(200),
    uen: z
      .string()
      .trim()
      .toUpperCase()
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^[0-9A-Z]{9,10}$/.test(v), 'A UEN has 9 or 10 letters and digits, e.g. 201912345K'),
    gstRegistered: z.boolean(),
    gstRegNo: optionalText(20),
    phone: optionalText(30),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
    address: optionalText(300),
    quoteValidityDays: z.number({ message: 'Enter a number of days' }).int().min(1, 'At least 1 day').max(365, 'At most 365 days'),
    quoteTerms: optionalText(5000),
  })
  .refine((b) => !b.gstRegistered || !!b.gstRegNo, { path: ['gstRegNo'], message: 'Enter your GST registration number' });
export type BusinessSettingsInput = z.input<typeof businessSettingsSchema>;

export const roleLabel: Record<Role, string> = { owner: 'Owner', admin: 'Admin', staff: 'Staff' };
export const roleHelp: Record<Role, string> = {
  owner: 'Everything, including billing, owners and deleting data.',
  admin: 'Everything except managing owners.',
  staff: 'Day-to-day work: customers, quotations, calendar and tasks. Can’t change settings or delete customers.',
};

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
  role: z.enum(ROLES),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`).max(200),
});

export const newPasswordSchema = z.object({
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`).max(200),
});

export const acceptInviteSchema = z.object({
  name: z.string().trim().max(100).optional(),
  password: z.string().min(1, 'Enter a password').max(200),
});

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastActiveAt: string | null;
  isYou: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
}

export interface TeamResponse {
  members: TeamMember[];
  invites: PendingInvite[];
}

export interface InviteInfo {
  businessName: string;
  email: string;
  role: Role;
  accountExists: boolean;
}
