import { NextRequest, NextResponse } from "next/server";
import { getVacationRules, setVacationRules } from "@/lib/store";

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
    const body = await request.json();

    if (Array.isArray(body.biWeekRules)) {
      const arr = body.biWeekRules.slice(0, 52);
      while (arr.length < 52) arr.push(null);
      body.biWeekRules = arr;
    } else {
      body.biWeekRules = Array(52).fill(null);
    }

    const rules = await setVacationRules(body);
    return NextResponse.json(rules);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
