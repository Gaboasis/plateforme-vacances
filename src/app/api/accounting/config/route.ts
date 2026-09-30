import { NextRequest, NextResponse } from "next/server";
import { findAccountingActor } from "@/lib/accounting-staff";
import { getEducators } from "@/lib/store";
import {
  ensureAccountingConfig,
  setAccountingConfig,
} from "@/lib/store-accounting";

export async function GET() {
  try {
    const config = await ensureAccountingConfig();
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown> & {
      _actorEducatorId?: string;
      dailyChildRateCents?: number;
      dailyInfantRateCents?: number;
      dailyOver18RateCents?: number;
      defaultEmployerContributionPercent?: number;
    };
    const actorId =
      typeof body._actorEducatorId === "string"
        ? body._actorEducatorId.trim()
        : "";
    const educators = await getEducators();
    if (!findAccountingActor(educators, actorId)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const updates: {
      dailyChildRateCents?: number;
      dailyInfantRateCents?: number;
      dailyOver18RateCents?: number;
      defaultEmployerContributionPercent?: number;
    } = {};
    if (typeof body.dailyChildRateCents === "number") {
      updates.dailyChildRateCents = body.dailyChildRateCents;
    }
    if (typeof body.dailyInfantRateCents === "number") {
      updates.dailyInfantRateCents = body.dailyInfantRateCents;
    }
    if (typeof body.dailyOver18RateCents === "number") {
      updates.dailyOver18RateCents = body.dailyOver18RateCents;
    }
    if (typeof body.defaultEmployerContributionPercent === "number") {
      updates.defaultEmployerContributionPercent =
        body.defaultEmployerContributionPercent;
    }

    const config = await setAccountingConfig(updates);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
