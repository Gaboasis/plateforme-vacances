/** Montants en cents (entiers) pour éviter les erreurs de virgule flottante. */

export function dollarsToCents(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  }
  const cleaned = value.replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatCad(cents: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(centsToDollars(cents));
}

export function parseCadInput(input: string): number {
  return dollarsToCents(input);
}

export function computeEmployerContributionCents(
  grossPayCents: number,
  percent: number
): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((grossPayCents * percent) / 100);
}

export function computeGrossFromHours(
  hours: number,
  hourlyRateCents: number
): number {
  if (!Number.isFinite(hours) || hours <= 0 || hourlyRateCents <= 0) return 0;
  return Math.round(hours * hourlyRateCents);
}
