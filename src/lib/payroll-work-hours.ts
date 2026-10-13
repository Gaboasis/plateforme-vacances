/** Pause repas non payée (punch in/out GAB → heures payables). */
export const UNPAID_LUNCH_BREAK_HOURS = 1;

export function roundHoursToQuarter(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * 4) / 4;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Durée horloge punch in → out (avant pause), arrondi au quart d'heure. */
export function grossClockHoursBetweenTimes(start: string, end: string): number {
  let diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff <= 0) diff += 24 * 60;
  return roundHoursToQuarter(diff / 60);
}

/** Heures payables après déduction de la pause non payée. */
export function payableHoursFromGrossClock(grossHours: number): number {
  if (!Number.isFinite(grossHours) || grossHours <= 0) return 0;
  const net = grossHours - UNPAID_LUNCH_BREAK_HOURS;
  if (net <= 0) return 0;
  return roundHoursToQuarter(net);
}

export function payableHoursFromClockTimes(start: string, end: string): number {
  return payableHoursFromGrossClock(grossClockHoursBetweenTimes(start, end));
}
