import { describe, expect, it } from 'vitest';
import { countWorkingDays, monthsBetween } from '../src/services/working-days';

/**
 * Pure unit tests for the leave arithmetic. No database, no HTTP - this is the
 * calculation the entire leave feature depends on, so it is worth pinning down
 * on its own.
 *
 * Reference week used below (2026):
 *   Mon 2 Nov, Tue 3, Wed 4, Thu 5, Fri 6, Sat 7, Sun 8 Nov
 */
const date = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const UAE_WEEK = [1, 2, 3, 4, 5]; // Monday to Friday
const KSA_WEEK = [0, 1, 2, 3, 4]; // Sunday to Thursday

describe('countWorkingDays', () => {
  it('counts a full working week for a Monday-to-Friday entity', () => {
    expect(
      countWorkingDays({ start: date('2026-11-02'), end: date('2026-11-06'), workWeek: UAE_WEEK, holidays: [] }),
    ).toBe(5);
  });

  it('excludes the weekend when the range spans it', () => {
    // Mon 2 Nov to Mon 9 Nov: 8 calendar days, Sat and Sun are not working days.
    expect(
      countWorkingDays({ start: date('2026-11-02'), end: date('2026-11-09'), workWeek: UAE_WEEK, holidays: [] }),
    ).toBe(6);
  });

  /**
   * The behaviour that justifies modelling legal entities: the same calendar
   * range costs a different number of leave days per country.
   */
  it('applies a different weekend for a Sunday-to-Thursday entity', () => {
    const range = { start: date('2026-11-06'), end: date('2026-11-08'), holidays: [] }; // Fri, Sat, Sun
    expect(countWorkingDays({ ...range, workWeek: UAE_WEEK })).toBe(1); // Friday only
    expect(countWorkingDays({ ...range, workWeek: KSA_WEEK })).toBe(1); // Sunday only
  });

  it('skips public holidays that fall on a working day', () => {
    expect(
      countWorkingDays({
        start: date('2026-11-02'),
        end: date('2026-11-06'),
        workWeek: UAE_WEEK,
        holidays: [date('2026-11-04')], // Wednesday
      }),
    ).toBe(4);
  });

  it('ignores a public holiday that already falls on a non-working day', () => {
    expect(
      countWorkingDays({
        start: date('2026-11-02'),
        end: date('2026-11-06'),
        workWeek: UAE_WEEK,
        holidays: [date('2026-11-07')], // Saturday
      }),
    ).toBe(5);
  });

  it('deducts half a day at each end of a multi-day request', () => {
    expect(
      countWorkingDays({
        start: date('2026-11-02'),
        end: date('2026-11-06'),
        workWeek: UAE_WEEK,
        holidays: [],
        halfDayStart: true,
        halfDayEnd: true,
      }),
    ).toBe(4);
  });

  it('treats a single-day half-day request as exactly half a day', () => {
    expect(
      countWorkingDays({
        start: date('2026-11-03'),
        end: date('2026-11-03'),
        workWeek: UAE_WEEK,
        holidays: [],
        halfDayStart: true,
        halfDayEnd: true,
      }),
    ).toBe(0.5);
  });

  /** Guards against a half-day flag on a weekend creating a negative charge. */
  it('does not deduct a half day that lands on a non-working day', () => {
    expect(
      countWorkingDays({
        start: date('2026-11-07'), // Saturday
        end: date('2026-11-09'), // Monday
        workWeek: UAE_WEEK,
        holidays: [],
        halfDayStart: true,
      }),
    ).toBe(1);
  });

  it('returns zero when the range contains no working days', () => {
    expect(
      countWorkingDays({ start: date('2026-11-07'), end: date('2026-11-08'), workWeek: UAE_WEEK, holidays: [] }),
    ).toBe(0);
  });

  it('returns zero when the end date precedes the start date', () => {
    expect(
      countWorkingDays({ start: date('2026-11-06'), end: date('2026-11-02'), workWeek: UAE_WEEK, holidays: [] }),
    ).toBe(0);
  });
});

describe('monthsBetween', () => {
  it('counts whole months only', () => {
    expect(monthsBetween(date('2024-01-15'), date('2025-01-14'))).toBe(11);
    expect(monthsBetween(date('2024-01-15'), date('2025-01-15'))).toBe(12);
  });
});
