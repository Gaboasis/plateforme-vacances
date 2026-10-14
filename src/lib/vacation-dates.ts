import { parseISO } from "date-fns";

/** Date civile (sans décalage UTC) à partir d'une chaîne yyyy-MM-dd ou ISO. */
export function parseVacationDate(isoDate: string): Date {
  const trimmed = isoDate.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return new Date(y, mo, d);
  }
  return parseISO(trimmed);
}
