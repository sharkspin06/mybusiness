import { z } from 'zod';

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const REMINDER_CHANNELS = ['whatsapp', 'email'] as const;
export const REMINDER_OFFSETS = [15, 60, 120, 1440, 2880] as const; // minutes before

export function reminderLabel(r: { channel: (typeof REMINDER_CHANNELS)[number]; minutesBefore: number }): string {
  const ch = r.channel === 'whatsapp' ? 'WhatsApp' : 'Email';
  const m = r.minutesBefore;
  const when = m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`;
  return `${ch}, ${when} before`;
}

const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)) && /T/.test(v), 'Enter a date and time');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const reminderSchema = z.object({
  channel: z.enum(REMINDER_CHANNELS),
  minutesBefore: z.number().int().min(5).max(10080),
});

export const appointmentInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title').max(200),
    customerId: z.string().uuid().nullish().transform((v) => v ?? null),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    location: optionalText(300),
    assignedTo: z.string().uuid().nullish().transform((v) => v ?? null),
    status: z.enum(APPOINTMENT_STATUSES).default('confirmed'),
    notes: optionalText(5000),
    reminders: z.array(reminderSchema).max(3).default([]),
  })
  .refine((a) => Date.parse(a.endsAt) > Date.parse(a.startsAt), { path: ['endsAt'], message: 'Must end after it starts' })
  .refine((a) => Date.parse(a.endsAt) - Date.parse(a.startsAt) <= 24 * 60 * 60 * 1000, { path: ['endsAt'], message: 'Appointments can be up to 24 hours long' });

export type AppointmentInput = z.input<typeof appointmentInputSchema>;
export type AppointmentData = z.output<typeof appointmentInputSchema>;

/** Move or resize only (drag to reschedule). */
export const appointmentTimeSchema = z
  .object({ startsAt: isoDateTime, endsAt: isoDateTime })
  .refine((a) => Date.parse(a.endsAt) > Date.parse(a.startsAt), { path: ['endsAt'], message: 'Must end after it starts' });

export interface Appointment extends Omit<AppointmentData, 'reminders'> {
  id: string;
  reminders: z.output<typeof reminderSchema>[];
  customer: { id: string; name: string; phone: string | null } | null;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  name: string;
  role: string;
}
