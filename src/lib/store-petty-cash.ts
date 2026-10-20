import { prisma } from "./db";
import type { PettyCashTransaction } from "@/types";
import {
  computePettyCashBalanceCents,
  DEFAULT_PETTY_CASH_OPENING_BALANCE_CENTS,
} from "./petty-cash-utils";
import { ensureAccountingConfig } from "./store-accounting";

export { computePettyCashBalanceCents, pettyCashSignedDelta } from "./petty-cash-utils";

function parseDateOnly(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error("Date invalide (AAAA-MM-JJ).");
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function rowToType(row: {
  id: string;
  transactionDate: Date;
  direction: string;
  amountCents: number;
  note: string | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
}): PettyCashTransaction {
  const direction = row.direction === "out" ? "out" : "in";
  return {
    id: row.id,
    transactionDate: row.transactionDate.toISOString().slice(0, 10),
    direction,
    amountCents: row.amountCents,
    note: row.note ?? undefined,
    createdById: row.createdById,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPettyCashTransactions(): Promise<PettyCashTransaction[]> {
  const rows = await prisma.pettyCashTransaction.findMany({
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(rowToType);
}

export async function getPettyCashOpeningBalanceCents(): Promise<number> {
  const config = await ensureAccountingConfig();
  const cents = config.pettyCashOpeningBalanceCents;
  if (cents == null || !Number.isFinite(cents)) {
    return DEFAULT_PETTY_CASH_OPENING_BALANCE_CENTS;
  }
  return Math.max(0, Math.round(cents));
}

export async function getPettyCashBalanceCents(): Promise<number> {
  const [opening, rows] = await Promise.all([
    getPettyCashOpeningBalanceCents(),
    prisma.pettyCashTransaction.findMany({
      select: { direction: true, amountCents: true },
    }),
  ]);
  const movement = computePettyCashBalanceCents(
    rows.map((r) => ({
      direction: r.direction === "out" ? "out" : "in",
      amountCents: r.amountCents,
    }))
  );
  return opening + movement;
}

export async function createPettyCashTransaction(options: {
  transactionDate: string;
  direction: "in" | "out";
  amountCents: number;
  note?: string;
  actorId: string;
  actorName: string;
}): Promise<PettyCashTransaction> {
  if (options.amountCents <= 0) {
    throw new Error("Le montant doit être supérieur à 0.");
  }
  const row = await prisma.pettyCashTransaction.create({
    data: {
      transactionDate: parseDateOnly(options.transactionDate),
      direction: options.direction,
      amountCents: Math.round(options.amountCents),
      note: options.note?.trim() || null,
      createdById: options.actorId,
      createdByName: options.actorName,
    },
  });
  return rowToType(row);
}
