/** Solde de départ petite caisse (1 930,55 $). */
export const DEFAULT_PETTY_CASH_OPENING_BALANCE_CENTS = 193_055;

export function pettyCashSignedDelta(
  direction: "in" | "out",
  amountCents: number
): number {
  return direction === "in" ? amountCents : -amountCents;
}

export function computePettyCashBalanceCents(
  rows: { direction: "in" | "out"; amountCents: number }[]
): number {
  return rows.reduce(
    (sum, r) => sum + pettyCashSignedDelta(r.direction, r.amountCents),
    0
  );
}
