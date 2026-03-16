import {
  getISOWeek,
  startOfISOWeek,
  endOfISOWeek,
  addWeeks,
  format,
} from "date-fns";
import { fr } from "date-fns/locale";

const WEEKS_COUNT = 52;

/** Numéro de semaine (1-52) à partir d'une date - utilisé pour les règles par jour */
export function getBiWeekFromDate(date: Date): number {
  const weekNum = getISOWeek(date);
  return Math.min(WEEKS_COUNT, Math.max(1, weekNum));
}

/** Date de début et fin d'une semaine pour une année donnée */
export function getBiWeekDateRange(
  weekIndex: number,
  year: number
): { start: Date; end: Date; label: string } {
  const jan4 = new Date(year, 0, 4);
  const week1Start = startOfISOWeek(jan4);
  const weekStart = addWeeks(week1Start, weekIndex - 1);
  const weekEnd = endOfISOWeek(weekStart);

  return {
    start: weekStart,
    end: weekEnd,
    label: `S${weekIndex} : ${format(weekStart, "d MMM", { locale: fr })} — ${format(weekEnd, "d MMM yyyy", { locale: fr })}`,
  };
}

/** Toutes les 52 semaines pour une année - règles par semaine (appliquées à chaque jour) */
export function getAllBiWeekRanges(year: number): { index: number; start: Date; end: Date; label: string }[] {
  const result: { index: number; start: Date; end: Date; label: string }[] = [];
  for (let i = 1; i <= WEEKS_COUNT; i++) {
    const { start, end, label } = getBiWeekDateRange(i, year);
    result.push({ index: i, start, end, label });
  }
  return result;
}
