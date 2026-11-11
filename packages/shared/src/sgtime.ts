// Singapore time helpers. Singapore is UTC+8 all year (no daylight saving), so conversions are exact
// and don't depend on the timezone of the computer or phone running the app.

const SG_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Shift a UTC instant so its UTC fields read as Singapore wall-clock time. */
const shifted = (iso: string | Date) => new Date(new Date(iso).getTime() + SG_OFFSET_MS);

/** ISO instant -> Singapore date "YYYY-MM-DD". */
export function sgDate(iso: string | Date): string {
  const d = shifted(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** ISO instant -> Singapore time "HH:mm" (24-hour). */
export function sgTime(iso: string | Date): string {
  const d = shifted(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Minutes after Singapore midnight for an ISO instant (0–1439). */
export function sgMinutes(iso: string | Date): number {
  const d = shifted(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Singapore date "YYYY-MM-DD" + time "HH:mm" -> ISO instant (UTC). */
export function sgToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - SG_OFFSET_MS).toISOString();
}

/** Day of week for "YYYY-MM-DD": 0 = Monday … 6 = Sunday (Singapore weeks start on Monday). */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekday(date));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

/** First day of the month containing `date`. */
export const startOfMonth = (date: string) => `${date.slice(0, 7)}-01`;

/** "HH:mm" -> minutes, and back. */
export const timeToMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
};
export const minutesToTime = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const weekdayName = (date: string) => WEEKDAYS[weekday(date)]!;
export const weekdayShort = (date: string) => weekdayName(date).slice(0, 3);
export const monthName = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
