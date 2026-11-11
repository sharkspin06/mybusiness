import { addDays, isoToDisplay, sgDate, sgTime, startOfWeek, weekdayName, weekdayShort, type Appointment } from '@mybusiness/shared';
import { Badge, cx } from '../../components/ui';
import { appointmentStatusLabel } from '@mybusiness/shared';
import { byDate, monthCells } from './MonthGrid';
import { isInternal } from './layout';

/** One appointment as a large tappable card. */
function AgendaCard({ a, onOpen }: { a: Appointment; onOpen: (a: Appointment) => void }) {
  const muted = a.status === 'cancelled' || a.status === 'completed';
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      className={cx(
        'w-full flex gap-3 p-3 rounded-lg text-left cursor-pointer min-h-16',
        isInternal(a) || muted ? 'bg-surface-1' : 'bg-accent-soft',
        a.status === 'cancelled' && 'line-through text-ink-3',
      )}
    >
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{sgTime(a.startsAt)}</span>
      <span className="grow min-w-0 flex flex-col gap-0.5">
        <span className="text-[16px] font-medium">{a.customer ? `${a.title} — ${a.customer.name}` : a.title}</span>
        <span className="text-[14px] text-ink-3">
          {sgTime(a.startsAt)}–{sgTime(a.endsAt)}
          {a.location ? ` · ${a.location}` : ''}
        </span>
      </span>
      {muted && (
        <span className="shrink-0 self-start">
          <Badge tone={a.status === 'completed' ? 'green' : 'grey'}>{appointmentStatusLabel[a.status]}</Badge>
        </span>
      )}
    </button>
  );
}

function Agenda({ date, items, onOpen }: { date: string; items: Appointment[]; onOpen: (a: Appointment) => void }) {
  const list = items.filter((a) => sgDate(a.startsAt) === date);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[16px] font-semibold">
        {weekdayName(date)}, {isoToDisplay(date)}
      </p>
      {list.length ? list.map((a) => <AgendaCard key={a.id} a={a} onOpen={onOpen} />) : <p className="text-ink-3 py-3">No appointments.</p>}
    </div>
  );
}

/** Phone day view: a strip of this week's days (dots mark busy days) and the chosen day's agenda. */
export function MobileDay({ date, today, items, onDate, onOpen }: { date: string; today: string; items: Appointment[]; onDate: (d: string) => void; onOpen: (a: Appointment) => void }) {
  const monday = startOfWeek(date);
  const busy = byDate(items);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-0.5" role="group" aria-label="Days this week">
        {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDate(d)}
            aria-pressed={d === date}
            className={cx(
              'flex-1 min-h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs cursor-pointer',
              d === date ? 'bg-accent text-accent-soft' : d === today ? 'text-accent' : 'text-ink-3',
            )}
          >
            {weekdayShort(d)}
            <b className={cx('text-base font-semibold tabular-nums', d === date ? 'text-white' : d === today ? 'text-accent' : 'text-ink')}>{Number(d.slice(8))}</b>
            <span className={cx('size-1 rounded-full', busy.has(d) ? (d === date ? 'bg-white' : 'bg-accent') : 'bg-transparent')} />
          </button>
        ))}
      </div>
      <Agenda date={date} items={items} onOpen={onOpen} />
      <p className="text-[14px] text-ink-3">Tap an appointment to reschedule or update it.</p>
    </div>
  );
}

/** Phone week view: days listed one under another. */
export function MobileWeek({ date, today, items, onOpen }: { date: string; today: string; items: Appointment[]; onOpen: (a: Appointment) => void }) {
  const monday = startOfWeek(date);
  const map = byDate(items);
  return (
    <div className="flex flex-col">
      {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => {
        const list = map.get(d) ?? [];
        return (
          <div key={d} className="flex gap-3 py-2.5 border-b border-line-soft">
            <span className="w-11 shrink-0 flex flex-col items-center">
              <span className="text-xs text-ink-3">{weekdayShort(d)}</span>
              <span className={cx('text-lg font-semibold tabular-nums', d === today ? 'text-accent' : 'text-ink')}>{Number(d.slice(8))}</span>
            </span>
            <div className="grow min-w-0 flex flex-col gap-1.5">
              {list.length ? list.map((a) => <AgendaCard key={a.id} a={a} onOpen={onOpen} />) : <span className="text-ink-3 py-2.5">No appointments</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Phone month view: a compact grid with dots; tapping a day shows its agenda below. */
export function MobileMonth({ date, today, items, onDate, onOpen }: { date: string; today: string; items: Appointment[]; onDate: (d: string) => void; onOpen: (a: Appointment) => void }) {
  const month = date.slice(0, 7);
  const busy = byDate(items);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-xs text-ink-3 py-1" aria-hidden="true">
            {d}
          </span>
        ))}
        {monthCells(date).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDate(d)}
            aria-pressed={d === date}
            aria-label={`${weekdayName(d)} ${isoToDisplay(d)}${busy.has(d) ? `, ${busy.get(d)!.length} appointments` : ''}`}
            className={cx(
              'h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm tabular-nums cursor-pointer',
              d.slice(0, 7) !== month && 'text-ink-4',
              d === date ? 'bg-accent text-white' : d === today ? 'text-accent font-semibold' : '',
            )}
          >
            {Number(d.slice(8))}
            <span className={cx('size-1 rounded-full', busy.has(d) ? (d === date ? 'bg-white' : 'bg-accent') : 'bg-transparent')} />
          </button>
        ))}
      </div>
      <Agenda date={date} items={items} onOpen={onOpen} />
    </div>
  );
}
