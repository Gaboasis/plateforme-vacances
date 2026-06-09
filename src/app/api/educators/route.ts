import { NextRequest, NextResponse } from "next/server";
import { createEducator, getEducators, updateEducator } from "@/lib/store";
import { hashPassword } from "@/lib/auth";
import { isFullAdmin } from "@/lib/staff-actor";
import type { Educator } from "@/types";

function sanitizeEducator(e: Educator): Omit<Educator, "passwordHash"> {
  const { passwordHash: _, ...rest } = e;
  return rest;
}

async function requireFullAdmin(body: Record<string, unknown>) {
  const actorId =
    typeof body._actorEducatorId === "string"
      ? body._actorEducatorId.trim()
      : "";
  delete body._actorEducatorId;
  const educators = await getEducators();
  const actor = educators.find((e) => e.id === actorId);
  if (!actor || !isFullAdmin(actor)) {
    return null;
  }
  return actor;
}

const VALID_ROLES = new Set([
  "educatrice",
  "cuisiniere",
  "entretien",
  "secretaire",
]);

export async function GET() {
  try {
    const list = await getEducators();
    return NextResponse.json(list.map(sanitizeEducator));
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown> & {
      id?: string;
      name?: string;
      email?: string;
      role?: string;
      seniorityRank?: number | string;
      isQualified?: boolean;
      password?: string;
      _actorEducatorId?: string;
    };
    if (!(await requireFullAdmin(body))) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const id = typeof body.id === "string" ? body.id.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const role =
      typeof body.role === "string" && VALID_ROLES.has(body.role)
        ? body.role
        : "educatrice";
    const password =
      typeof body.password === "string" ? body.password.trim() : "";
    const rankRaw = body.seniorityRank;
    const seniorityRank =
      rankRaw === "" || rankRaw == null
        ? undefined
        : typeof rankRaw === "number"
          ? rankRaw
          : parseInt(String(rankRaw), 10);

    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json(
        {
          error:
            "Identifiant requis (lettres minuscules, chiffres ou tirets, ex. samiha).",
        },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ error: "Nom requis." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Courriel invalide." }, { status: 400 });
    }
    if (password.length < 4) {
      return NextResponse.json(
        { error: "Mot de passe initial requis (min. 4 caractères)." },
        { status: 400 }
      );
    }
    if (
      seniorityRank != null &&
      (!Number.isInteger(seniorityRank) ||
        seniorityRank < 1 ||
        seniorityRank > 15)
    ) {
      return NextResponse.json(
        { error: "Rang d’ancienneté : entre 1 et 15." },
        { status: 400 }
      );
    }

    const created = await createEducator({
      id,
      name,
      email,
      role: role as Educator["role"],
      seniorityRank,
      isQualified: body.isQualified === true,
      passwordHash: hashPassword(password),
    });
    return NextResponse.json(sanitizeEducator(created), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown> & {
      id?: string;
      newPassword?: string;
      _actorEducatorId?: string;
    };
    if (!(await requireFullAdmin(body))) {
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
