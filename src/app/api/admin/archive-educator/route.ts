import { NextRequest, NextResponse } from "next/server";
import { getEducators } from "@/lib/store";
import { archiveDepartedEducator } from "@/lib/archive-departed-educator";
import { isFullAdmin } from "@/lib/staff-actor";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fromEducatorId?: string;
      archiveToEducatorId?: string;
      _actorEducatorId?: string;
    };

    const actorId =
      typeof body._actorEducatorId === "string"
        ? body._actorEducatorId.trim()
        : "";
    const educators = await getEducators();
    const actor = educators.find((e) => e.id === actorId);
    if (!actor || !isFullAdmin(actor)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const fromEducatorId =
      typeof body.fromEducatorId === "string" ? body.fromEducatorId.trim() : "";
    if (!fromEducatorId) {
      return NextResponse.json(
        { error: "Identifiant de l’employé·e requis." },
        { status: 400 }
      );
    }

    const summary = await archiveDepartedEducator({
      fromEducatorId,
      archiveToEducatorId:
        typeof body.archiveToEducatorId === "string"
          ? body.archiveToEducatorId.trim()
          : undefined,
      actorEducatorId: actor.id,
    });

    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
