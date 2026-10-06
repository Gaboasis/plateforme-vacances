import { NextRequest, NextResponse } from "next/server";
import { findAccountingActor } from "@/lib/accounting-staff";
import { getEducators } from "@/lib/store";
import { assertCanEditLockedJournalDay } from "@/lib/verify-journal-day-edit";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      date?: string;
      editPassword?: string;
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

    const auth = await assertCanEditLockedJournalDay({
      dateStr,
      actorId: actor.id,
      editPassword: body.editPassword,
    });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
