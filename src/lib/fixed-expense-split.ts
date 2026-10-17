import {
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { fr } from "date-fns/locale";

/** Mois au format YYYY-MM */
export function monthKeyFromDate(dateStr: string): string {
  return dateStr.trim().slice(0, 7);
}

export function monthBounds(monthKey: string): {
  periodStart: string;
  periodEnd: string;
} {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) throw new Error("Mois invalide (YYYY-MM).");
  const start = startOfMonth(parseISO(`${monthKey}-01`));
  const end = endOfMonth(start);
  return {
    periodStart: format(start, "yyyy-MM-dd"),
    periodEnd: format(end, "yyyy-MM-dd"),
  };
}

export function formatMonthLabel(monthKey: string): string {
  try {
    return format(parseISO(`${monthKey}-01`), "MMMM yyyy", { locale: fr });
  } catch {
    return monthKey;
  }
}

/** Répartit un montant en cents en parts égales (reste sur les premiers mois). */
export function splitAmountCents(totalCents: number, parts: number): number[] {
  if (parts < 1) return [];
  const total = Math.max(0, Math.round(totalCents));
  const base = Math.floor(total / parts);
  const rem = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
}

export function defaultSplitMonthKeys(invoiceDateStr: string, count = 3): string[] {
  const base = monthKeyFromDate(invoiceDateStr);
  const [y, mo] = base.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(y, mo - 1 + i, 1);
    out.push(format(d, "yyyy-MM"));
  }
  return out;
}

export function sortMonthKeys(keys: string[]): string[] {
  return [...keys].sort();
}

export function isValidMonthKey(key: string): boolean {
  return /^\d{4}-\d{2}$/.test(key.trim());
}

export function isValidDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key.trim());
}

function parseDateOnlyUtc(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error("Date invalide (AAAA-MM-JJ).");
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function formatDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function addMonthsUtc(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

function daysInclusiveUtc(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export type CoverageSplitSegment = {
  periodStart: string;
  periodEnd: string;
  monthKey: string;
  dayCount: number;
  sharePercent: number;
  amountCents: number;
};

/** Fin de couverture par défaut : dernier jour du 3e mois à partir de la date facture. */
export function defaultCoverageEnd(invoiceDateStr: string): string {
  const start = parseDateOnlyUtc(invoiceDateStr);
  const inThirdMonth = addMonthsUtc(start, 2);
  return formatDateOnlyUtc(endOfMonthUtc(inThirdMonth));
}

/**
 * Répartit le montant au prorata des jours de couverture par mois calendaire
 * (intersection [coverageStart, coverageEnd] avec chaque mois).
 */
export function splitAmountByCoverageDays(
  totalCents: number,
  coverageStartStr: string,
  coverageEndStr: string
): CoverageSplitSegment[] {
  const total = Math.max(0, Math.round(totalCents));
  if (total <= 0) return [];

  const coverageStart = parseDateOnlyUtc(coverageStartStr);
  const coverageEnd = parseDateOnlyUtc(coverageEndStr);
  if (coverageStart > coverageEnd) {
    throw new Error("La date de fin doit être le même jour ou après le début.");
  }

  const totalDays = daysInclusiveUtc(coverageStart, coverageEnd);
  const rawSegments: {
    periodStart: Date;
    periodEnd: Date;
    dayCount: number;
  }[] = [];

  let cursor = coverageStart;
  while (cursor <= coverageEnd) {
    const monthEnd = endOfMonthUtc(cursor);
    const segStart = cursor;
    const segEnd = coverageEnd < monthEnd ? coverageEnd : monthEnd;
    rawSegments.push({
      periodStart: segStart,
      periodEnd: segEnd,
      dayCount: daysInclusiveUtc(segStart, segEnd),
    });
    cursor = new Date(
      Date.UTC(segEnd.getUTCFullYear(), segEnd.getUTCMonth(), segEnd.getUTCDate() + 1)
    );
  }

  if (rawSegments.length === 0) return [];

  const exactShares = rawSegments.map(
    (s) => (total * s.dayCount) / totalDays
  );
  const amounts = exactShares.map((x) => Math.floor(x));
  let remainder = total - amounts.reduce((a, b) => a + b, 0);
  const order = exactShares
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remainder > 0; k++) {
    amounts[order[k]!.i]! += 1;
    remainder -= 1;
  }

  return rawSegments.map((s, i) => ({
    periodStart: formatDateOnlyUtc(s.periodStart),
    periodEnd: formatDateOnlyUtc(s.periodEnd),
    monthKey: formatDateOnlyUtc(s.periodStart).slice(0, 7),
    dayCount: s.dayCount,
    sharePercent: Math.round((s.dayCount / totalDays) * 10_000) / 100,
    amountCents: amounts[i]!,
  }));
}
