import { NextRequest, NextResponse } from "next/server";
import { findAccountingActor } from "@/lib/accounting-staff";
import {
  createFixedExpenseEntry,
  deleteFixedExpenseEntry,
  listFixedExpensesForPeriod,
} from "@/lib/store-accounting";
import { getEducators } from "@/lib/store";

async function requireActor(actorId: string | undefined) {
  const educators = await getEducators();
  return findAccountingActor(educators, actorId);
}

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from")?.trim() ?? "";
    const to = request.nextUrl.searchParams.get("to")?.trim() ?? "";
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();
    if (!(await requireActor(actorId))) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }
    if (!from || !to) {
      return NextResponse.json({ error: "from et to requis." }, { status: 400 });
    }
    const items = await listFixedExpensesForPeriod(from, to);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      periodStart?: string;
      periodEnd?: string;
      label?: string;
      amountCents?: number;
      amountDollars?: string;
      sourceName?: string;
      note?: string;
      _actorEducatorId?: string;
    };
    const actorId =
      typeof body._actorEducatorId === "string"
        ? body._actorEducatorId.trim()
        : "";
    if (!(await requireActor(actorId))) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const periodStart = body.periodStart?.trim() ?? "";
    const periodEnd = body.periodEnd?.trim() ?? "";
    const label = body.label?.trim() ?? "";
    if (!periodStart || !periodEnd || !label) {
      return NextResponse.json({ error: "Période et libellé requis." }, { status: 400 });
    }

    let amountCents = 0;
    if (typeof body.amountCents === "number") {
      amountCents = body.amountCents;
    } else if (typeof body.amountDollars === "string") {
      const n = parseFloat(body.amountDollars.replace(",", "."));
      amountCents = Number.isFinite(n) ? Math.round(n * 100) : 0;
    }
    if (amountCents <= 0) {
      return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
    }

    const created = await createFixedExpenseEntry({
      periodStart,
      periodEnd,
      label,
      amountCents,
      sourceName: body.sourceName,
      note: body.note,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: string; _actorEducatorId?: string };
    const actorId =
      typeof body._actorEducatorId === "string"
        ? body._actorEducatorId.trim()
        : "";
    if (!(await requireActor(actorId))) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "ID requis." }, { status: 400 });
    }
    await deleteFixedExpenseEntry(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
