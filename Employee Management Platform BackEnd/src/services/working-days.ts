/**
 * Working-day arithmetic.
 *
 * This is the concrete payoff of modelling legal entities properly: the UAE
 * entity works Monday-Friday while the Saudi and Egyptian entities work
 * Sunday-Thursday, and each observes a different public-holiday calendar. The
 * same five-calendar-day leave request therefore costs a different number of
 * leave days depending on which entity the employee belongs to.
 *
 * All dates are handled at UTC midnight. Leave is a calendar concept - a day off
 * on the 3rd is the 3rd everywhere - so introducing timezones here would only
 * create off-by-one bugs.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export interface WorkingDayOptions {
  start: Date;
  end: Date;
  /** Day-of-week indexes that count as working days, 0 = Sunday. */
  workWeek: number[];
  /** Public holidays for the employee's legal entity. */
  holidays: Date[];
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}

/**
 * Counts chargeable leave days between two inclusive dates.
 *
 * Weekends and public holidays are skipped entirely. A half day is only
 * deducted when the day it falls on was actually a working day, so marking a
 * Friday as a half day in the UAE entity does not silently create a -0.5 credit.
 */
export function countWorkingDays(options: WorkingDayOptions): number {
  const { workWeek, holidays, halfDayStart = false, halfDayEnd = false } = options;
  const start = startOfUtcDay(options.start);
  const end = startOfUtcDay(options.end);

  if (end.getTime() < start.getTime()) return 0;
  if (workWeek.length === 0) return 0;

  const workingDaySet = new Set(workWeek);
  const holidaySet = new Set(holidays.map((holiday) => toDateKey(startOfUtcDay(holiday))));

  const isWorkingDay = (date: Date): boolean =>
    workingDaySet.has(date.getUTCDay()) && !holidaySet.has(toDateKey(date));

  let total = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    if (isWorkingDay(cursor)) total += 1;
  }

  if (total === 0) return 0;

  // A single-day request can only ever be a half day once, however the caller
  // flags it.
  if (start.getTime() === end.getTime()) {
    return halfDayStart || halfDayEnd ? 0.5 : total;
  }

  if (halfDayStart && isWorkingDay(start)) total -= 0.5;
  if (halfDayEnd && isWorkingDay(end)) total -= 0.5;

  return Math.max(0, Number(total.toFixed(2)));
}

/** Every calendar date in an inclusive range - used to paint the leave calendar. */
export function eachDateInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const from = startOfUtcDay(start);
  const to = startOfUtcDay(end);
  for (let cursor = from; cursor.getTime() <= to.getTime(); cursor = addDays(cursor, 1)) {
    dates.push(new Date(cursor));
  }
  return dates;
}

/** Whole months between two dates, used for tenure and probation calculations. */
export function monthsBetween(from: Date, to: Date): number {
  const years = to.getUTCFullYear() - from.getUTCFullYear();
  const months = to.getUTCMonth() - from.getUTCMonth();
  const total = years * 12 + months;
  return to.getUTCDate() < from.getUTCDate() ? total - 1 : total;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
