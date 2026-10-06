import { NextRequest, NextResponse } from "next/server";
import {
  canViewComptabiliteSalaryDetails,
  findAccountingActor,
} from "@/lib/accounting-staff";
import { getEducators } from "@/lib/store";
import {
  ensureAccountingConfig,
  setAccountingConfig,
} from "@/lib/store-accounting";
import type { EmployerContributionMethod } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();
    const educators = await getEducators();
    if (!findAccountingActor(educators, actorId)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }
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
      employerContributionMethod?: string;
      defaultEmployerContributionPercent?: number;
      qcRrqEmployerPercent?: number;
      qcAeEmployerPercent?: number;
      qcRqapEmployerPercent?: number;
      qcFssEmployerPercent?: number;
      qcCnesstEmployerPercent?: number;
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
    if (!canViewComptabiliteSalaryDetails(actor)) {
      return NextResponse.json(
        { error: "Réservé à l'administrateur." },
        { status: 403 }
      );
    }

    const updates: {
      dailyChildRateCents?: number;
      dailyInfantRateCents?: number;
      dailyOver18RateCents?: number;
      employerContributionMethod?: EmployerContributionMethod;
      defaultEmployerContributionPercent?: number;
      qcRrqEmployerPercent?: number;
      qcAeEmployerPercent?: number;
      qcRqapEmployerPercent?: number;
      qcFssEmployerPercent?: number;
      qcCnesstEmployerPercent?: number;
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
    if (body.employerContributionMethod === "flat_percent") {
      updates.employerContributionMethod = "flat_percent";
    } else if (body.employerContributionMethod === "quebec_statutory") {
      updates.employerContributionMethod = "quebec_statutory";
    }
    if (typeof body.qcRrqEmployerPercent === "number") {
      updates.qcRrqEmployerPercent = body.qcRrqEmployerPercent;
    }
    if (typeof body.qcAeEmployerPercent === "number") {
      updates.qcAeEmployerPercent = body.qcAeEmployerPercent;
    }
    if (typeof body.qcRqapEmployerPercent === "number") {
      updates.qcRqapEmployerPercent = body.qcRqapEmployerPercent;
    }
    if (typeof body.qcFssEmployerPercent === "number") {
      updates.qcFssEmployerPercent = body.qcFssEmployerPercent;
    }
    if (typeof body.qcCnesstEmployerPercent === "number") {
      updates.qcCnesstEmployerPercent = body.qcCnesstEmployerPercent;
    }

    const config = await setAccountingConfig(updates);
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
