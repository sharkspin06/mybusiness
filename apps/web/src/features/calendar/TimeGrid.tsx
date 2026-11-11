import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { minutesToTime, sgMinutes, sgTime, weekdayShort, type Appointment } from '@mybusiness/shared';
import { cx } from '../../components/ui';
import { DAY_END, DAY_START, HOUR_PX, SNAP, blockClass, minToPx, placeDay } from './layout';

interface Drag {
  id: string;
  x0: number;
  y0: number;
  colWidth: number;
  moved: boolean;
  dMin: number;
  dDay: number;
}

const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);

/**
 * Day/week time grid (desktop and tablet). Drag an appointment to move it (15-minute steps, across days
 * in week view); click it to open it; click an empty slot to book there.
 */
export function TimeGrid({
  dates,
  items,
  today,
  selectedId,
  onOpen,
  onCreate,
  onMove,
}: {
  dates: string[];
  items: Appointment[];
  today: string;
  selectedId?: string | null;
  onOpen: (a: Appointment) => void;
  onCreate: (date: string, time: string) => void;
  onMove: (a: Appointment, startsAt: string, endsAt: string) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState(() => sgMinutes(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNowMin(sgMinutes(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  const startDrag = (e: RPointerEvent, a: Appointment) => {
    if (e.button !== 0 || a.status === 'cancelled') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const d: Drag = { id: a.id, x0: e.clientX, y0: e.clientY, colWidth: colRef.current?.getBoundingClientRect().width ?? 1, moved: false, dMin: 0, dDay: 0 };
    dragRef.current = d;
  };
  const moveDrag = (e: RPointerEvent, dayIndex: number) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    const dMin = Math.round(((dy / HOUR_PX) * 60) / SNAP) * SNAP;
    const dDay = Math.min(Math.max(Math.round(dx / d.colWidth), -dayIndex), dates.length - 1 - dayIndex);
    const next = { ...d, moved: true, dMin, dDay };
    dragRef.current = next;
    setDrag(next);
  };
  const endDrag = (a: Appointment) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) return onOpen(a);
    const shift = (d.dMin + d.dDay * 1440) * 60_000;
    if (shift === 0) return;
    onMove(a, new Date(Date.parse(a.startsAt) + shift).toISOString(), new Date(Date.parse(a.endsAt) + shift).toISOString());
  };

  const clickSlot = (e: React.MouseEvent<HTMLDivElement>, date: string) => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.min(DAY_START + Math.floor(((y / HOUR_PX) * 60) / 30) * 30, DAY_END - 60);
    onCreate(date, minutesToTime(min));
  };

  const height = minToPx(DAY_END);
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: dates.length > 1 ? 760 : undefined }}>
        {dates.length > 1 && (
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(0, 1fr))` }}>
            <span />
            {dates.map((d) => (
              <div key={d} className="py-2.5 px-2 text-center border-l border-line-soft">
                <span className="text-[14px] text-ink-3">{weekdayShort(d)}</span>{' '}
                <span className={cx('font-semibold tabular-nums', d === today ? 'text-accent' : 'text-ink')}>{d.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid select-none" style={{ gridTemplateColumns: `56px repeat(${dates.length}, minmax(0, 1fr))` }}>
          <div aria-hidden="true">
            {HOURS.map((h) => (
              <div key={h} className="text-[12px] text-ink-3 text-right pr-2 pt-0.5 tabular-nums" style={{ height: HOUR_PX }}>
                {minutesToTime(h)}
              </div>
            ))}
          </div>
          {dates.map((date, dayIndex) => (
            <div
              key={date}
              ref={dayIndex === 0 ? colRef : undefined}
              onClick={(e) => clickSlot(e, date)}
              className={cx('relative border-l border-line-soft cursor-copy', date === today && 'bg-[#FAFCFC]')}
              style={{
                height,
                backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line-soft) 0, var(--color-line-soft) 1px, transparent 1px, transparent ${HOUR_PX}px)`,
              }}
            >
              {placeDay(items, date).map(({ a, top, height: h, lane, lanes }) => {
                const isDragging = drag?.id === a.id;
                const dragPx = isDragging ? (drag.dMin / 60) * HOUR_PX : 0;
                const dragX = isDragging ? drag.dDay * drag.colWidth : 0;
                const newStart = isDragging ? minutesToTime(Math.max(0, sgMinutes(a.startsAt) + drag.dMin)) : null;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onPointerDown={(e) => startDrag(e, a)}
                    onPointerMove={(e) => moveDrag(e, dayIndex)}
                    onPointerUp={() => endDrag(a)}
                    onPointerCancel={() => {
                      dragRef.current = null;
                      setDrag(null);
                    }}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(a))}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${a.title}${a.customer ? ` with ${a.customer.name}` : ''}, ${sgTime(a.startsAt)} to ${sgTime(a.endsAt)}`}
                    className={cx(
                      'absolute rounded-sm border px-2 py-1 text-left text-xs leading-tight overflow-hidden touch-none',
                      blockClass(a),
                      a.status === 'cancelled' ? 'cursor-pointer' : 'cursor-grab',
                      isDragging && 'z-20 shadow-pop cursor-grabbing opacity-90',
                      selectedId === a.id && 'ring-2 ring-accent',
                    )}
                    style={{
                      top: top + 1,
                      height: h - 2,
                      left: `calc(${(lane / lanes) * 100}% + 3px)`,
                      width: `calc(${100 / lanes}% - 6px)`,
                      transform: isDragging ? `translate(${dragX}px, ${dragPx}px)` : undefined,
                    }}
                  >
                    <span className="block font-semibold truncate">{a.title}</span>
                    {h > 34 && (
                      <span className="block truncate">
                        {newStart ?? sgTime(a.startsAt)}–{isDragging ? minutesToTime(Math.max(0, sgMinutes(a.endsAt) + drag.dMin)) : sgTime(a.endsAt)}
                        {a.customer ? ` · ${a.customer.name}` : ''}
                      </span>
                    )}
                  </button>
                );
              })}
              {date === today && nowMin >= DAY_START && nowMin <= DAY_END && (
                <div aria-hidden="true" className="absolute left-0 right-0 h-0.5 bg-danger pointer-events-none" style={{ top: minToPx(nowMin) }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
