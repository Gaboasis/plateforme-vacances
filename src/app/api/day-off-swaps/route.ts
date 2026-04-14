import { NextRequest, NextResponse } from "next/server";
import {
  createDayOffSwapRequest,
  getAllDayOffSwapRequests,
  getDayOffSwapDashboard,
  getEducators,
  getPendingSwapByRequester,
} from "@/lib/store";
import {
  isKamarSecretaryForSwap,
  LOUBABA_EDUCATOR_ID,
} from "@/lib/kamar-loubaba-swap";

function validIsoDay(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const all = searchParams.get("all") === "1" || searchParams.get("admin") === "1";
    if (all) {
      const list = await getAllDayOffSwapRequests();
      return NextResponse.json(list);
    }
    const educatorId = searchParams.get("educatorId");
    if (!educatorId) {
      return NextResponse.json(
        { error: "Paramètre educatorId requis" },
        { status: 400 }
      );
    }
    const data = await getDayOffSwapDashboard(educatorId);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      educatorId,
      educatorName,
      requesterOffDay,
      mode,
      targetEducatorId,
      targetEducatorName,
      message,
    } = body;

    if (!educatorId || !educatorName) {
      return NextResponse.json({ error: "Profil requis" }, { status: 400 });
    }
    const dayNum =
      typeof requesterOffDay === "string"
        ? parseInt(requesterOffDay, 10)
        : requesterOffDay;
    if (!validIsoDay(dayNum)) {
      return NextResponse.json(
        { error: "Indiquez votre journée de congé (lundi à dimanche)." },
        { status: 400 }
      );
    }

    const educators = await getEducators();
    const me = educators.find((e) => e.id === educatorId);
    const kamarSecretary = me != null && isKamarSecretaryForSwap(me);
    if (!me || (me.role !== "educatrice" && !kamarSecretary)) {
      return NextResponse.json(
        { error: "Échange de journée : réservé aux éducatrices." },
        { status: 403 }
      );
    }

    if (kamarSecretary) {
      if (mode !== "targeted") {
        return NextResponse.json(
          {
            error:
              "En tant que secrétaire, vous ne pouvez envoyer qu’une demande directe à Loubaba.",
          },
          { status: 400 }
        );
      }
      if (targetEducatorId !== LOUBABA_EDUCATOR_ID) {
        return NextResponse.json(
          {
            error:
              "Votre demande d’échange ne peut être adressée qu’à Loubaba.",
          },
          { status: 400 }
        );
      }
    }

    const requesterQualified = kamarSecretary ? false : me.isQualified === true;

    const pending = await getPendingSwapByRequester(educatorId);
    if (pending) {
      return NextResponse.json(
        {
          error:
            "Vous avez déjà une demande d’échange en attente. Annulez-la avant d’en créer une autre.",
        },
        { status: 400 }
      );
    }

    if (mode === "targeted") {
      if (!targetEducatorId) {
        return NextResponse.json(
          { error: "Choisissez la collègue avec qui vous avez convenu l’échange." },
          { status: 400 }
        );
      }
      if (targetEducatorId === educatorId) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas vous sélectionner vous-même." },
          { status: 400 }
        );
      }
      const target = educators.find((e) => e.id === targetEducatorId);
      if (!target || target.role !== "educatrice") {
        return NextResponse.json(
          { error: "La collègue choisie est introuvable ou n’est pas éducatrice." },
          { status: 400 }
        );
      }
      if (requesterQualified && target.isQualified !== true) {
        return NextResponse.json(
          {
            error:
              "En tant qu’éducatrice qualifiée, vous ne pouvez adresser une demande qu’à une autre éducatrice qualifiée.",
          },
          { status: 400 }
        );
      }
      const created = await createDayOffSwapRequest({
        requesterId: educatorId,
        requesterName: educatorName,
        requesterIsQualified: requesterQualified,
        requesterOffDay: dayNum,
        mode: "targeted",
        targetEducatorId: target.id,
        targetEducatorName: target.name,
        message: message ?? undefined,
      });
      return NextResponse.json(created);
    }

    if (mode !== "open") {
      return NextResponse.json({ error: "Mode de demande invalide." }, { status: 400 });
    }

    const created = await createDayOffSwapRequest({
      requesterId: educatorId,
      requesterName: educatorName,
      requesterIsQualified: requesterQualified,
      requesterOffDay: dayNum,
      mode: "open",
      message: message ?? undefined,
    });
    return NextResponse.json(created);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
