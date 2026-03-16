import { NextRequest, NextResponse } from "next/server";
import { getEducators, updateEducator } from "@/lib/store";
import { hashPassword } from "@/lib/auth";

function sanitizeEducator(e: { passwordHash?: string; [key: string]: unknown }) {
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
    const body = await request.json();
    const { id, newPassword, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "ID manquant" }, { status: 400 });
    }
    if (newPassword) {
      updates.passwordHash = hashPassword(newPassword);
    }
    const updated = await updateEducator(id, updates);
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
