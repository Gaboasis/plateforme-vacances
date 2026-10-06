import { NextRequest, NextResponse } from "next/server";
import {
  canAccessComptabilitePeriodAnalysis,
  findAccountingActor,
} from "@/lib/accounting-staff";
import { buildPeriodReport } from "@/lib/accounting-period-report";
import { getEducators } from "@/lib/store";

function parseHolidayDatesParam(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from")?.trim() ?? "";
    const to = request.nextUrl.searchParams.get("to")?.trim() ?? "";
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();

    const datesParam =
      request.nextUrl.searchParams.get("statutoryHolidayDates") ??
      request.nextUrl.searchParams.get("holidayDates");
    const statutoryHolidayDates = parseHolidayDatesParam(datesParam);

    const educators = await getEducators();
    const actor = findAccountingActor(educators, actorId);
    if (!actor) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }
    if (!canAccessComptabilitePeriodAnalysis(actor)) {
      return NextResponse.json(
        { error: "Analyse de période réservée à l'administrateur." },
        { status: 403 }
      );
    }

    if (!from || !to) {
      return NextResponse.json(
        { error: "Paramètres from et to requis (AAAA-MM-JJ)." },
        { status: 400 }
      );
    }

    const report = await buildPeriodReport({
      fromStr: from,
      toStr: to,
      statutoryHolidayDates,
    });

    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
