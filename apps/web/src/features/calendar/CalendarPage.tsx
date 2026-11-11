import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  addDays,
  addMonths,
  isoToDisplay,
  monthName,
  sgDate,
  sgMinutes,
  startOfWeek,
  todayInSingapore,
  weekdayName,
  type Appointment,
} from '@mybusiness/shared';
import { Dialog } from '../../components/Dialog';
import { Segmented } from '../../components/form';
import { Icon } from '../../components/Icon';
import { Button, Card, EmptyState } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useCustomer } from '../customers/api';
import { useAppointmentsRange, useMoveAppointment } from './api';
import { AppointmentDetail } from './AppointmentDetail';
import { AppointmentDialog } from './AppointmentDialog';
import { MobileDay, MobileMonth, MobileWeek } from './MobileViews';
import { MonthGrid, monthCells } from './MonthGrid';
import { TimeGrid } from './TimeGrid';

type View = 'day' | 'week' | 'month';
const VIEWS: { value: View; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function useIsPhone() {
  const query = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Next round half hour today, or 10:00 on another day. */
function defaultStart(date: string, today: string) {
  if (date !== today) return '10:00';
  const m = Math.min(Math.ceil((sgMinutes(new Date()) + 1) / 30) * 30, 22 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Calendar: day, week and month views. View, date and the open appointment live in the URL. */
export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const isPhone = useIsPhone();
  const { user } = useSession();
  const today = todayInSingapore();
  const view: View = (VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : isPhone ? 'day' : 'week') as View;
  const date = isDate(params.get('date')) ? params.get('date')! : today;
  const openId = params.get('appt');
  const creating = params.get('new') === '1';
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [newAt, setNewAt] = useState<{ date: string; start: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Note: two update() calls in the same tick don't combine (the second wins), so merge changes into one call.
  const update = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  // What to load: the visible range (the day view loads its whole week for the phone's day strip).
  const [from, to] = useMemo(() => {
    if (view === 'month') {
      const cells = monthCells(date);
      return [cells[0]!, addDays(cells[41]!, 1)];
    }
    const monday = startOfWeek(date);
    return [monday, addDays(monday, 7)];
  }, [view, date]);
  const { data, isLoading, isError, error, refetch } = useAppointmentsRange(from, to);
  const items = data?.items ?? [];
  const move = useMoveAppointment();
  const prefill = useCustomer(creating ? (params.get('customer') ?? '') : '');

  const step = (dir: 1 | -1) => {
    if (view === 'month') return update({ date: addMonths(date, dir) });
    if (view === 'week' || isPhone) return update({ date: addDays(date, 7 * dir) });
    update({ date: addDays(date, dir) });
  };
  const label =
    view === 'month'
      ? monthName(date)
      : view === 'week' || isPhone
        ? `${isoToDisplay(startOfWeek(date)).slice(0, 5)} – ${isoToDisplay(addDays(startOfWeek(date), 6))}`
        : `${weekdayName(date)}, ${isoToDisplay(date)}`;

  const open = (a: Appointment) => update({ appt: a.id });
  const selected = items.find((a) => a.id === openId) ?? null;
  const onMove = (a: Appointment, startsAt: string, endsAt: string) => {
    setMoveError(null);
    move.mutate({ id: a.id, startsAt, endsAt }, { onError: (e) => setMoveError(errorMessage(e)) });
  };
  const startNew = (d = date, start = defaultStart(d, today)) => {
    setNewAt({ date: d, start });
    update({ new: '1' });
  };
  const showSidePanel = view === 'day' && !isPhone;

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="hidden md:block text-2xl leading-8 font-semibold mr-2">Calendar</h1>
        <div className="w-full md:w-auto md:order-last">
          <div className="md:hidden">
            <Segmented label="View" value={view} options={VIEWS} onChange={(v) => update({ view: v, appt: null })} />
          </div>
        </div>
        <Button size="sm" onClick={() => update({ date: null })} className="max-md:h-11">
          Today
        </Button>
        <Button size="sm" variant="ghost" aria-label="Previous" onClick={() => step(-1)} className="w-[30px] px-0 max-md:size-11">
          <Icon name="chevronLeft" />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Next" onClick={() => step(1)} className="w-[30px] px-0 max-md:size-11">
          <Icon name="chevronRight" />
        </Button>
        <span className="text-base font-semibold tabular-nums" aria-live="polite">
          {label}
        </span>
        <div className="grow" />
        <div className="hidden md:block">
          <Segmented label="View" value={view} options={VIEWS} onChange={(v) => update({ view: v, appt: null })} />
        </div>
        <Button variant="primary" onClick={() => startNew()} className="hidden md:inline-flex">
          <Icon name="plus" />
          New appointment
        </Button>
      </div>

      {moveError && (
        <p role="alert" className="rounded-sm bg-danger-soft text-danger text-sm px-3 py-2">
          Couldn’t move the appointment: {moveError}
        </p>
      )}

      {isError ? (
        <EmptyState title="Could not load the calendar" body={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
      ) : isLoading ? (
        <Card className="p-6 text-ink-3">Loading calendar…</Card>
      ) : isPhone ? (
        view === 'day' ? (
          <MobileDay date={date} today={today} items={items} onDate={(d) => update({ date: d })} onOpen={open} />
        ) : view === 'week' ? (
          <MobileWeek date={date} today={today} items={items} onOpen={open} />
        ) : (
          <MobileMonth date={date} today={today} items={items} onDate={(d) => update({ date: d })} onOpen={open} />
        )
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          <Card className={showSidePanel ? 'flex-[2_1_480px] min-w-0 py-2 overflow-hidden' : 'w-full overflow-hidden'}>
            {view === 'month' ? (
              <MonthGrid date={date} items={items} today={today} onOpen={open} onDay={(d) => update({ view: 'day', date: d })} />
            ) : (
              <TimeGrid
                dates={view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : [date]}
                items={items}
                today={today}
                selectedId={openId}
                onOpen={open}
                onCreate={(d, t) => startNew(d, t)}
                onMove={onMove}
              />
            )}
          </Card>
          {showSidePanel && (
            <Card className="flex-[1_1_280px] min-w-0 p-5">
              {selected ? (
                <AppointmentDetail a={selected} onEdit={() => setEditing(selected)} />
              ) : (
                <p className="text-sm text-ink-3">Select an appointment to see its details. Drag it to another time to reschedule, or click an empty slot to book.</p>
              )}
            </Card>
          )}
        </div>
      )}
      {!isPhone && view !== 'month' && (
        <p className="text-[14px] text-ink-3">Drag an appointment to reschedule. Click an empty slot to book. Reminders can be set per appointment.</p>
      )}

      {/* Details dialog (everywhere except the desktop day view, which has a side panel) */}
      <Dialog open={!!selected && !showSidePanel && !editing} size="sm" title="Appointment" onClose={() => update({ appt: null })}>
        {selected && <AppointmentDetail a={selected} onEdit={() => setEditing(selected)} />}
      </Dialog>

      <AppointmentDialog
        open={!!editing}
        appointment={editing ?? undefined}
        myId={user.id}
        onClose={() => setEditing(null)}
        onSaved={(a) => update({ date: sgDate(a.startsAt), appt: a.id })}
      />
      <AppointmentDialog
        open={creating && (!params.get('customer') || !prefill.isLoading)}
        defaults={{
          date: newAt?.date ?? date,
          start: newAt?.start ?? defaultStart(newAt?.date ?? date, today),
          customer: prefill.data ? { ...prefill.data } : null,
        }}
        myId={user.id}
        onClose={() => {
          setNewAt(null);
          update({ new: null, customer: null });
        }}
        // One URL update: React Router doesn't chain two setParams calls made in the same tick.
        onSaved={(a) => update({ new: null, customer: null, date: sgDate(a.startsAt), appt: isPhone ? null : a.id })}
      />
    </>
  );
}
