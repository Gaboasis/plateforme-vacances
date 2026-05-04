import { NextRequest, NextResponse } from "next/server";
import { getEducators, updateEducator } from "@/lib/store";
import { hashPassword } from "@/lib/auth";
import { isFullAdmin } from "@/lib/staff-actor";
import type { Educator } from "@/types";

function sanitizeEducator(e: Educator): Omit<Educator, "passwordHash"> {
  const { passwordHash: _, ...rest } = e;
  return rest;
}

export async function GET() {
  try {
    const list = await getEducators();
    return NextResponse.json(list.map(sanitizeEducator));
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown> & {
      id?: string;
      newPassword?: string;
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

    const { id, newPassword, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "ID manquant" }, { status: 400 });
    }
    if (newPassword) {
      updates.passwordHash = hashPassword(newPassword);
    }
    const updated = await updateEducator(id, updates as Partial<Educator>);
    if (!updated) {
      return NextResponse.json({ error: "Éducatrice introuvable" }, {
        status: 404,
      });
    }
    return NextResponse.json(sanitizeEducator(updated));
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
