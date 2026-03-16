import { NextRequest, NextResponse } from "next/server";
import { getEducators } from "@/lib/store";
import { verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { educatorId, password } = await request.json();

    if (!educatorId || !password) {
      return NextResponse.json(
        { error: "Identifiant et mot de passe requis" },
        { status: 400 }
      );
    }

    const educators = await getEducators();
    const educator = educators.find((e) => e.id === educatorId);

    if (!educator) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 401 }
      );
    }

    const hash = educator.passwordHash;
    if (!hash || !verifyPassword(password, hash)) {
      return NextResponse.json(
        { error: "Mot de passe incorrect" },
        { status: 401 }
      );
    }

    const { passwordHash: _, ...user } = educator;
    return NextResponse.json({ user });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
