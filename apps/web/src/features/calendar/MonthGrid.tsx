import { addDays, sgDate, sgTime, startOfMonth, startOfWeek, type Appointment } from '@mybusiness/shared';
import { cx } from '../../components/ui';
import { blockClass } from './layout';

const DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The 42 dates (6 weeks, Monday first) shown for the month containing `date`. */
export function monthCells(date: string): string[] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function byDate(items: Appointment[]) {
  const map = new Map<string, Appointment[]>();
  for (const a of items) {
    const d = sgDate(a.startsAt);
    map.set(d, [...(map.get(d) ?? []), a]);
  }
  return map;
}

/** Desktop month view: up to 3 appointments per day, then "+N more". */
export function MonthGrid({
  date,
  items,
  today,
  onOpen,
  onDay,
}: {
  date: string;
  items: Appointment[];
  today: string;
  onOpen: (a: Appointment) => void;
  onDay: (date: string) => void;
}) {
  const month = date.slice(0, 7);
  const map = byDate(items);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-line">
          {DOWS.map((d) => (
            <span key={d} className="px-2 py-2 text-xs font-medium text-ink-3">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthCells(date).map((d) => {
            const list = map.get(d) ?? [];
            const out = d.slice(0, 7) !== month;
            return (
              <div key={d} className="min-h-[108px] border-r border-b border-line-soft px-1.5 py-1.5 flex flex-col gap-1 [&:nth-child(7n)]:border-r-0">
                <button
                  type="button"
                  onClick={() => onDay(d)}
                  aria-label={`Open ${d}`}
                  className={cx(
                    'self-start size-7 rounded-full text-[14px] font-medium flex items-center justify-center cursor-pointer hover:bg-surface-2',
                    out && 'text-ink-4',
                    d === today && 'bg-accent text-white hover:bg-accent-hover',
                  )}
                >
                  {Number(d.slice(8))}
                </button>
                {list.slice(0, 3).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onOpen(a)}
                    className={cx('w-full text-left text-xs px-1.5 py-0.5 rounded-[4px] border truncate cursor-pointer', blockClass(a))}
                  >
                    <span className="tabular-nums">{sgTime(a.startsAt)}</span> {a.title}
                    {a.customer ? ` — ${a.customer.name}` : ''}
                  </button>
                ))}
                {list.length > 3 && (
                  <button type="button" onClick={() => onDay(d)} className="text-left text-xs text-ink-3 px-1.5 hover:text-ink cursor-pointer">
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
