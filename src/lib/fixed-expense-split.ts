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
