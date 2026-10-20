import { NextRequest, NextResponse } from "next/server";
import { findAccountingActor } from "@/lib/accounting-staff";
import { isValidDateKey } from "@/lib/fixed-expense-split";
import {
  createPettyCashTransaction,
  getPettyCashBalanceCents,
  getPettyCashOpeningBalanceCents,
  listPettyCashTransactions,
} from "@/lib/store-petty-cash";
import { getEducators } from "@/lib/store";
import { parseCadInput } from "@/lib/money";

async function requireActor(actorId: string | undefined) {
  const educators = await getEducators();
  return findAccountingActor(educators, actorId);
}

export async function GET(request: NextRequest) {
  try {
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();
    if (!(await requireActor(actorId))) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const [transactions, balanceCents, openingBalanceCents] = await Promise.all([
      listPettyCashTransactions(),
      getPettyCashBalanceCents(),
      getPettyCashOpeningBalanceCents(),
    ]);

    return NextResponse.json({
      transactions,
      balanceCents,
      openingBalanceCents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      direction?: string;
      amountDollars?: string;
      amountCents?: number;
      transactionDate?: string;
      note?: string;
      _actorEducatorId?: string;
    };

    const actorId =
      typeof body._actorEducatorId === "string"
        ? body._actorEducatorId.trim()
        : "";
    const educators = await getEducators();
    const actor = findAccountingActor(educators, actorId);
    if (!actor) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const direction = body.direction === "out" ? "out" : body.direction === "in" ? "in" : null;
    if (!direction) {
      return NextResponse.json(
        { error: "Direction requise (in ou out)." },
        { status: 400 }
      );
    }

    const transactionDate = body.transactionDate?.trim() ?? "";
    if (!isValidDateKey(transactionDate)) {
      return NextResponse.json(
        { error: "Date invalide (AAAA-MM-JJ)." },
        { status: 400 }
      );
    }

    let amountCents = 0;
    if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
      amountCents = Math.round(body.amountCents);
    } else if (typeof body.amountDollars === "string") {
      amountCents = parseCadInput(body.amountDollars);
    }
    if (amountCents <= 0) {
      return NextResponse.json(
        { error: "Montant invalide." },
        { status: 400 }
      );
    }

    const transaction = await createPettyCashTransaction({
      transactionDate,
      direction,
      amountCents,
      note: typeof body.note === "string" ? body.note : undefined,
      actorId: actor.id,
      actorName: actor.name,
    });

    const [balanceCents, openingBalanceCents] = await Promise.all([
      getPettyCashBalanceCents(),
      getPettyCashOpeningBalanceCents(),
    ]);

    return NextResponse.json({
      transaction,
      balanceCents,
      openingBalanceCents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
