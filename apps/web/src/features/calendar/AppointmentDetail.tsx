import { Link } from 'react-router';
import {
  appointmentStatusLabel,
  formatPhoneSG,
  isoToDisplay,
  reminderLabel,
  sgDate,
  sgTime,
  weekdayName,
  whatsappLink,
  type Appointment,
  type AppointmentInput,
  type AppointmentStatus,
} from '@mybusiness/shared';
import { Icon } from '../../components/Icon';
import { Badge, Button, type BadgeTone } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useSaveAppointment } from './api';

export const appointmentTone: Record<AppointmentStatus, BadgeTone> = { pending: 'amber', confirmed: 'teal', completed: 'green', cancelled: 'grey' };

const toInput = (a: Appointment, status: AppointmentStatus): AppointmentInput => ({
  title: a.title,
  customerId: a.customerId,
  startsAt: a.startsAt,
  endsAt: a.endsAt,
  location: a.location,
  assignedTo: a.assignedTo,
  status,
  notes: a.notes,
  reminders: a.reminders,
});

/** Appointment details with quick actions. Shown in the day view's side panel, or in a dialog. */
export function AppointmentDetail({ a, onEdit }: { a: Appointment; onEdit: () => void }) {
  const save = useSaveAppointment();
  const setStatus = (status: AppointmentStatus) => save.mutate({ id: a.id, data: toInput(a, status) });
  const date = sgDate(a.startsAt);
  const first = a.customer?.name.split(/\s+/)[0];
  const wa = a.customer?.phone
    ? whatsappLink(a.customer.phone, `Hi ${first}, this is a reminder of your appointment on ${isoToDisplay(date)} at ${sgTime(a.startsAt)}${a.location ? ` (${a.location})` : ''}.`)
    : undefined;
  const rows: [string, string][] = [
    ['When', `${weekdayName(date)}, ${isoToDisplay(date)}, ${sgTime(a.startsAt)}–${sgTime(a.endsAt)}`],
    ['Where', a.location ?? '—'],
    ['Customer', a.customer ? `${a.customer.name}${a.customer.phone ? ` · ${formatPhoneSG(a.customer.phone)}` : ''}` : 'Internal (no customer)'],
    ['Assigned', a.assignee?.name ?? 'Unassigned'],
    ['Reminders', a.reminders.length ? a.reminders.map(reminderLabel).join(' · ') : 'None'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="self-start">
          <Badge tone={appointmentTone[a.status]}>{appointmentStatusLabel[a.status]}</Badge>
        </span>
        <h2 className="text-lg font-semibold">{a.customer ? `${a.title} — ${a.customer.name}` : a.title}</h2>
      </div>
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm m-0">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="m-0 break-words">{v}</dd>
          </div>
        ))}
        {a.notes && (
          <>
            <dt className="text-ink-3">Notes</dt>
            <dd className="m-0 whitespace-pre-line">{a.notes}</dd>
          </>
        )}
      </dl>
      {save.isError && <p className="text-sm text-danger">{errorMessage(save.error)}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={onEdit} className="max-md:h-11">
          Reschedule or edit
        </Button>
        {a.status !== 'completed' && a.status !== 'cancelled' && (
          <Button size="sm" onClick={() => setStatus('completed')} disabled={save.isPending} className="max-md:h-11">
            Mark completed
          </Button>
        )}
        {a.status !== 'cancelled' ? (
          <Button size="sm" variant="ghost" onClick={() => setStatus('cancelled')} disabled={save.isPending} className="max-md:h-11 text-danger hover:bg-danger-soft">
            Cancel appointment
          </Button>
        ) : (
          <Button size="sm" onClick={() => setStatus('confirmed')} disabled={save.isPending} className="max-md:h-11">
            Restore
          </Button>
        )}
      </div>
      {(wa || a.customer) && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-line-soft">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-11 md:h-[30px] px-2.5 rounded-sm border border-line-strong text-[14px] font-medium text-ink hover:bg-surface-1 mt-3">
              <Icon name="message" size={16} />
              WhatsApp customer
            </a>
          )}
          {a.customer && (
            <Link to={`/customers/${a.customer.id}`} className="inline-flex items-center h-11 md:h-[30px] px-2.5 rounded-sm text-[14px] font-medium text-accent hover:bg-accent-soft mt-3">
              Open customer
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
