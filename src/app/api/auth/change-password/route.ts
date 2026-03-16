import { NextRequest, NextResponse } from "next/server";
import { getEducators, updateEducator } from "@/lib/store";
import { verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { educatorId, currentPassword, newPassword } = await request.json();

    if (!educatorId || !newPassword || newPassword.length < 4) {
      return NextResponse.json(
        { error: "Nouveau mot de passe requis (min. 4 caractères)" },
        { status: 400 }
      );
    }

    const educators = await getEducators();
    const educator = educators.find((e) => e.id === educatorId);

    if (!educator || !educator.passwordHash) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );
    }

    if (currentPassword !== undefined) {
      if (!verifyPassword(currentPassword, educator.passwordHash)) {
        return NextResponse.json(
          { error: "Mot de passe actuel incorrect" },
          { status: 401 }
        );
      }
    }

    await updateEducator(educatorId, {
      passwordHash: hashPassword(newPassword),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
