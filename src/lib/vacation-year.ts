/**
 * Année de référence pour les plafonds de congés : 1 avril → 31 mars suivant.
 * Identifiée par l’année civile du 1 avril (ex. avril 2025 – mars 2026 = 2025).
 */

export function getVacationYearStartYear(date: Date): number {
  const month = date.getMonth();
  const day = date.getDate();
  const calendarYear = date.getFullYear();
  // Avant le 1 avril → année de congés commencée l’avril précédent
  if (month < 3 || (month === 3 && day < 1)) {
    return calendarYear - 1;
  }
  return calendarYear;
}

export function getVacationYearBounds(startYear: number): {
  start: Date;
  endExclusive: Date;
} {
  return {
    start: new Date(startYear, 3, 1),
    endExclusive: new Date(startYear + 1, 3, 1),
  };
}

export function isDateInVacationYear(date: Date, startYear: number): boolean {
  const { start, endExclusive } = getVacationYearBounds(startYear);
  const t = date.getTime();
  return t >= start.getTime() && t < endExclusive.getTime();
}

export function formatVacationYearLabel(startYear: number): string {
  return `du 1 avril ${startYear} au 31 mars ${startYear + 1}`;
}

export function clipIntervalToVacationYear(
  dStart: Date,
  dEnd: Date,
  startYear: number
): { s: Date; e: Date } | null {
  const { start, endExclusive } = getVacationYearBounds(startYear);
  const yearEnd = new Date(endExclusive.getTime() - 1);
  const s = dStart < start ? start : dStart;
  const e = dEnd > yearEnd ? yearEnd : dEnd;
  if (s > e) return null;
  return { s, e };
}
