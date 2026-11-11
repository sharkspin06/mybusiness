import { useEffect, useState, type FormEvent } from 'react';
import {
  APPOINTMENT_STATUSES,
  REMINDER_OFFSETS,
  appointmentInputSchema,
  appointmentStatusLabel,
  formatPhoneSG,
  minutesToTime,
  reminderLabel,
  sgDate,
  sgTime,
  sgToIso,
  timeToMinutes,
  type Appointment,
  type AppointmentStatus,
} from '@mybusiness/shared';
import { Dialog } from '../../components/Dialog';
import { Field, Select, TextArea, TextInput } from '../../components/form';
import { Icon } from '../../components/Icon';
import { Avatar, Button, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { CustomerPicker, type PickedCustomer } from '../quotations/CustomerPicker';
import { useDeleteAppointment, useMembers, useSaveAppointment } from './api';

type Channel = 'whatsapp' | 'email';
interface FormState {
  title: string;
  customer: PickedCustomer | null;
  date: string;
  start: string;
  end: string;
  location: string;
  assignedTo: string;
  status: AppointmentStatus;
  notes: string;
  reminders: { channel: Channel; minutesBefore: number }[];
}

export interface NewAppointmentDefaults {
  date: string;
  start: string;
  customer?: PickedCustomer | null;
}

function initial(a: Appointment | undefined, d: NewAppointmentDefaults | undefined, myId: string): FormState {
  if (a) {
    return {
      title: a.title,
      customer: a.customer ? { id: a.customer.id, name: a.customer.name, company: null, phone: a.customer.phone } : null,
      date: sgDate(a.startsAt),
      start: sgTime(a.startsAt),
      end: sgTime(a.endsAt),
      location: a.location ?? '',
      assignedTo: a.assignedTo ?? '',
      status: a.status,
      notes: a.notes ?? '',
      reminders: a.reminders,
    };
  }
  const start = d?.start ?? '10:00';
  const customer = d?.customer ?? null;
  return {
    title: '',
    customer,
    date: d?.date ?? '',
    start,
    end: minutesToTime(Math.min(timeToMinutes(start) + 60, 23 * 60 + 45)),
    location: customer?.address ? [customer.address, customer.postalCode ? `S${customer.postalCode}` : null].filter(Boolean).join(', ') : '',
    assignedTo: myId,
    status: 'confirmed',
    notes: '',
    reminders: customer ? [{ channel: 'whatsapp', minutesBefore: 1440 }] : [],
  };
}

/** Create or edit an appointment. Changing the date or times here is how you reschedule on a phone. */
export function AppointmentDialog({
  open,
  appointment,
  defaults,
  myId,
  onClose,
  onSaved,
}: {
  open: boolean;
  appointment?: Appointment;
  defaults?: NewAppointmentDefaults;
  myId: string;
  onClose: () => void;
  onSaved?: (a: Appointment) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initial(appointment, defaults, myId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: members } = useMembers();
  const save = useSaveAppointment();
  const del = useDeleteAppointment();

  useEffect(() => {
    if (open) {
      setForm(initial(appointment, defaults, myId));
      setErrors({});
      setFormError(null);
      setConfirmDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors(({ [k]: _a, startsAt: _b, endsAt: _c, ...rest }) => rest);
  };

  // Keep the length when the start time changes.
  const setStart = (start: string) => {
    if (!start) return set('start', start);
    const len = Math.max(timeToMinutes(form.end) - timeToMinutes(form.start), 15);
    setForm((f) => ({ ...f, start, end: minutesToTime(Math.min(timeToMinutes(start) + len, 23 * 60 + 59)) }));
    setErrors(({ startsAt: _b, endsAt: _c, ...rest }) => rest);
  };

  const pickCustomer = (c: PickedCustomer) => {
    setForm((f) => ({
      ...f,
      customer: c,
      location: f.location || [c.address, c.postalCode ? `S${c.postalCode}` : null].filter(Boolean).join(', '),
      reminders: f.reminders.length ? f.reminders : [{ channel: 'whatsapp', minutesBefore: 1440 }],
    }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.date || !form.start || !form.end) {
      setErrors({ ...(!form.date ? { date: 'Pick a date' } : {}), ...(!form.start || !form.end ? { endsAt: 'Pick a start and end time' } : {}) });
      return;
    }
    const input = {
      title: form.title,
      customerId: form.customer?.id ?? null,
      startsAt: sgToIso(form.date, form.start),
      endsAt: sgToIso(form.date, form.end),
      location: form.location,
      assignedTo: form.assignedTo || null,
      status: form.status,
      notes: form.notes,
      reminders: form.reminders,
    };
    const check = appointmentInputSchema.safeParse(input);
    if (!check.success) {
      const fe: Record<string, string> = {};
      for (const i of check.error.issues) fe[String(i.path[0])] ??= i.message;
      setErrors(fe);
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: appointment?.id, data: input });
      onClose();
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation') setErrors(err.fields);
      setFormError(errorMessage(err));
    }
  }

  async function remove() {
    if (!appointment) return;
    try {
      await del.mutateAsync(appointment);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setFormError(errorMessage(err));
    }
  }

  const timeError = errors.endsAt ?? errors.startsAt;
  return (
    <>
      <Dialog
        open={open && !picking && !confirmDelete}
        title={appointment ? 'Edit appointment' : 'New appointment'}
        onClose={onClose}
        footer={
          <>
            {appointment && (
              <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <div className="grow" />
            <Button onClick={onClose} className="max-md:h-11 max-md:grow">
              Cancel
            </Button>
            <Button type="submit" form="appointment-form" variant="primary" disabled={save.isPending} className="max-md:h-11 max-md:grow">
              {save.isPending ? 'Saving…' : appointment ? 'Save changes' : 'Book appointment'}
            </Button>
          </>
        }
      >
        <form id="appointment-form" onSubmit={submit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {formError && (
            <p role="alert" className="sm:col-span-2 rounded-sm bg-danger-soft text-danger text-sm px-3 py-2">
              {formError}
            </p>
          )}
          <Field label="Title" error={errors.title} className="sm:col-span-2">
            {(a) => <TextInput {...a} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Site measurement" />}
          </Field>
          <div className="sm:col-span-2">
            <span className="block text-[14px] font-medium text-ink-2 mb-1.5">Customer</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={cx('grow min-w-0 flex items-center gap-3 min-h-11 px-3 py-2 rounded-sm border bg-bg text-left cursor-pointer hover:bg-surface-1', errors.customerId ? 'border-danger' : 'border-line-strong')}
              >
                {form.customer ? (
                  <>
                    <Avatar name={form.customer.name} size="sm" />
                    <span className="grow min-w-0 truncate">
                      <span className="font-medium">{form.customer.name}</span>
                      {form.customer.phone && <span className="text-ink-3"> · {formatPhoneSG(form.customer.phone)}</span>}
                    </span>
                    <span className="text-[14px] font-medium text-accent">Change</span>
                  </>
                ) : (
                  <span className="text-ink-3">Internal (no customer) — tap to choose one</span>
                )}
              </button>
              {form.customer && (
                <Button variant="ghost" aria-label="Remove customer" className="max-md:size-11 w-9 px-0" onClick={() => set('customer', null)}>
                  <Icon name="close" size={16} />
                </Button>
              )}
            </div>
            {errors.customerId && <p className="text-xs text-danger mt-1.5">{errors.customerId}</p>}
          </div>
          <Field label="Date" error={errors.date} className="sm:col-span-2 md:col-span-1">
            {(a) => <TextInput {...a} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />}
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 md:col-span-1">
            <Field label="Start" error={timeError}>
              {(a) => <TextInput {...a} type="time" step={900} value={form.start} onChange={(e) => setStart(e.target.value)} />}
            </Field>
            <Field label="End">
              {(a) => <TextInput {...a} type="time" step={900} value={form.end} onChange={(e) => set('end', e.target.value)} />}
            </Field>
          </div>
          <Field label="Location" error={errors.location} className="sm:col-span-2">
            {(a) => <TextInput {...a} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Address, phone or video call" />}
          </Field>
          <Field label="Assigned to" error={errors.assignedTo}>
            {(a) => (
              <Select {...a} value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">Unassigned</option>
                {members?.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(a) => (
              <Select {...a} value={form.status} onChange={(e) => set('status', e.target.value as AppointmentStatus)}>
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {appointmentStatusLabel[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2 flex flex-col gap-2">
            <span className="text-[14px] font-medium text-ink-2">Reminders</span>
            {form.reminders.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Select
                  aria-label={`Reminder ${i + 1} channel`}
                  value={r.channel}
                  onChange={(e) => set('reminders', form.reminders.map((x, j) => (j === i ? { ...x, channel: e.target.value as Channel } : x)))}
                  className="w-36 shrink-0"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </Select>
                <Select
                  aria-label={`Reminder ${i + 1} timing`}
                  value={String(r.minutesBefore)}
                  onChange={(e) => set('reminders', form.reminders.map((x, j) => (j === i ? { ...x, minutesBefore: Number(e.target.value) } : x)))}
                >
                  {REMINDER_OFFSETS.map((m) => (
                    <option key={m} value={m}>
                      {reminderLabel({ channel: r.channel, minutesBefore: m }).split(', ')[1]}
                    </option>
                  ))}
                </Select>
                <Button variant="ghost" aria-label={`Remove reminder ${i + 1}`} className="max-md:size-11 w-9 px-0 shrink-0" onClick={() => set('reminders', form.reminders.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </Button>
              </div>
            ))}
            {form.reminders.length < 3 && (
              <Button size="sm" className="self-start max-md:h-11" onClick={() => set('reminders', [...form.reminders, { channel: 'email', minutesBefore: 60 }])}>
                <Icon name="plus" size={16} />
                Add reminder
              </Button>
            )}
            <p className="text-xs text-ink-3">Reminders are saved now and will be sent automatically once WhatsApp and email sending are set up.</p>
          </div>
          <Field label="Notes" className="sm:col-span-2">
            {(a) => <TextArea {...a} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
        </form>
      </Dialog>

      <CustomerPicker open={open && picking} onClose={() => setPicking(false)} onPick={pickCustomer} />

      <Dialog
        open={open && confirmDelete}
        size="sm"
        title="Delete appointment?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <div className="grow" />
            <Button onClick={() => setConfirmDelete(false)} className="max-md:h-11 max-md:grow">
              Keep it
            </Button>
            <Button variant="danger" onClick={remove} disabled={del.isPending} className="max-md:h-11 max-md:grow">
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-ink-2 leading-relaxed">
          This removes <strong className="font-semibold">{appointment?.title}</strong> from the calendar. To keep a record, set its status to Cancelled instead.
        </p>
      </Dialog>
    </>
  );
}
