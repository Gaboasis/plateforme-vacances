import { NextRequest, NextResponse } from "next/server";
import { getEducators } from "@/lib/store";
import { isFullAdmin } from "@/lib/staff-actor";
import { isValidDateKey } from "@/lib/fixed-expense-split";
import { getScheduleContextForDate } from "@/lib/store-weekly-schedule";

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date")?.trim() ?? "";
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();

    const educators = await getEducators();
    const actor = educators.find((e) => e.id === actorId);
    if (!actor || !isFullAdmin(actor)) {
      return NextResponse.json(
        { error: "Réservé à l'administrateur." },
        { status: 403 }
      );
    }

    if (!isValidDateKey(date)) {
      return NextResponse.json(
        { error: "Paramètre date requis (AAAA-MM-JJ)." },
        { status: 400 }
      );
    }

    const context = await getScheduleContextForDate(date);
    return NextResponse.json(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
