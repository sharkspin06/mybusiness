import { sgDate, sgMinutes, type Appointment } from '@mybusiness/shared';

/** Visible hours in the day and week grids. */
export const DAY_START = 7 * 60;
export const DAY_END = 21 * 60;
export const HOUR_PX = 48;
export const SNAP = 15; // minutes

export const minToPx = (min: number) => ((min - DAY_START) / 60) * HOUR_PX;

export interface Placed {
  a: Appointment;
  top: number;
  height: number;
  /** Side-by-side position when appointments overlap. */
  lane: number;
  lanes: number;
}

/** Appointments of one Singapore date, positioned for a time grid; overlapping ones share the width. */
export function placeDay(items: Appointment[], date: string): Placed[] {
  const day = items
    .filter((a) => sgDate(a.startsAt) === date)
    .map((a) => {
      const start = sgMinutes(a.startsAt);
      const sameDayEnd = sgDate(a.endsAt) === date ? sgMinutes(a.endsAt) : 24 * 60;
      const s = Math.min(Math.max(start, DAY_START), DAY_END - SNAP);
      const e = Math.max(Math.min(sameDayEnd, DAY_END), s + SNAP);
      return { a, s, e };
    })
    .sort((x, y) => x.s - y.s || y.e - x.e);

  const out: Placed[] = [];
  let cluster: { p: Placed; e: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.p.lane + 1));
    cluster.forEach((c) => (c.p.lanes = lanes));
    cluster = [];
  };
  for (const { a, s, e } of day) {
    if (s >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => c.e > s).map((c) => c.p.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const p: Placed = { a, top: minToPx(s), height: Math.max(minToPx(e) - minToPx(s), 20), lane, lanes: 1 };
    cluster.push({ p, e });
    clusterEnd = Math.max(clusterEnd, e);
    out.push(p);
  }
  flush();
  return out;
}

export const isInternal = (a: Appointment) => !a.customer;

/** Colours for an appointment block: customer appointments in the accent colour, internal ones in grey. */
export function blockClass(a: Appointment) {
  if (a.status === 'cancelled') return 'bg-surface-2 text-ink-3 border-line line-through';
  if (a.status === 'completed') return 'bg-surface-1 text-ink-3 border-line';
  return isInternal(a) ? 'bg-surface-2 text-ink-2 border-line' : 'bg-accent-soft text-accent-ink border-[#B5DCD6]';
}

export const apptLabel = (a: Appointment) => (a.customer ? `${a.title} — ${a.customer.name}` : a.title);
