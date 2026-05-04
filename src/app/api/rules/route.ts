import { NextRequest, NextResponse } from "next/server";
import { getEducators, getVacationRules, setVacationRules } from "@/lib/store";
import { isFullAdmin } from "@/lib/staff-actor";
import type { VacationRules } from "@/types";

export async function GET() {
  try {
    const rules = await getVacationRules();
    return NextResponse.json(rules);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown> & {
      _actorEducatorId?: string;
    };
    const actorId =
      typeof body._actorEducatorId === "string"
        ? body._actorEducatorId.trim()
        : "";
    delete body._actorEducatorId;
    const educators = await getEducators();
    const actor = educators.find((e) => e.id === actorId);
    if (!actor || !isFullAdmin(actor)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    if (Array.isArray(body.biWeekRules)) {
      const arr = body.biWeekRules.slice(0, 52);
      while (arr.length < 52) arr.push(null);
      body.biWeekRules = arr;
    } else {
      body.biWeekRules = Array(52).fill(null);
    }

    const rules = await setVacationRules(body as Partial<VacationRules>);
    return NextResponse.json(rules);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
