/** Indemnités patronales sur le salaire brut (journalier). */

export const SICK_LEAVE_INDEMNITY_PERCENT_DEFAULT = 0.8;

export function normalizeVacationIndemnityPercent(value: number | undefined | null): 4 | 6 {
  if (value === 6) return 6;
  return 4;
}

export function indemnityCentsFromGross(grossCents: number, percent: number): number {
  if (grossCents <= 0 || !Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((grossCents * percent) / 100);
}
