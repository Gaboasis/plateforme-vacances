import { NextRequest, NextResponse } from "next/server";
import { findAccountingActor } from "@/lib/accounting-staff";
import { buildPeriodReport } from "@/lib/accounting-period-report";
import { getEducators } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from")?.trim() ?? "";
    const to = request.nextUrl.searchParams.get("to")?.trim() ?? "";
    const holidaysRaw = request.nextUrl.searchParams.get("statutoryHolidays");
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();

    const educators = await getEducators();
    if (!findAccountingActor(educators, actorId)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    if (!from || !to) {
      return NextResponse.json(
        { error: "Paramètres from et to requis (AAAA-MM-JJ)." },
        { status: 400 }
      );
    }

    const statutoryHolidayCount = holidaysRaw
      ? parseInt(holidaysRaw, 10)
      : 0;

    const report = await buildPeriodReport({
      fromStr: from,
      toStr: to,
      statutoryHolidayCount: Number.isFinite(statutoryHolidayCount)
        ? statutoryHolidayCount
        : 0,
    });

    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
