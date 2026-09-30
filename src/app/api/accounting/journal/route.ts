import { NextRequest, NextResponse } from "next/server";
import { findAccountingActor } from "@/lib/accounting-staff";
import { getEducators } from "@/lib/store";
import {
  ensureAccountingConfig,
  getDailyJournal,
  getEducatorPaySummaries,
  listJournalSummariesForMonth,
  saveDailyJournal,
  type JournalLineInput,
} from "@/lib/store-accounting";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date");
    const month = request.nextUrl.searchParams.get("month");

    if (month) {
      const summaries = await listJournalSummariesForMonth(month);
      return NextResponse.json({ summaries });
    }

    if (!date) {
      return NextResponse.json(
        { error: "Paramètre date ou month requis." },
        { status: 400 }
      );
    }

    const [journal, config, payRates] = await Promise.all([
      getDailyJournal(date),
      ensureAccountingConfig(),
      getEducatorPaySummaries(),
    ]);

    return NextResponse.json({ journal, config, payRates, date });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      date?: string;
      notes?: string;
      lines?: JournalLineInput[];
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

    const dateStr = typeof body.date === "string" ? body.date.trim() : "";
    if (!dateStr) {
      return NextResponse.json({ error: "Date requise." }, { status: 400 });
    }

    const lines = Array.isArray(body.lines) ? body.lines : [];
    const journal = await saveDailyJournal({
      dateStr,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      lines,
      actorId: actor.id,
      actorName: actor.name,
    });

    return NextResponse.json(journal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
