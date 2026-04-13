import { NextRequest, NextResponse } from "next/server";
import {
  acceptDayOffSwap,
  AUDIT_ACTIONS,
  cancelDayOffSwap,
  createAuditLog,
  deleteDayOffSwapRequest,
  getDayOffSwapRequestById,
  getEducators,
} from "@/lib/store";
import { getClientIp, getUserAgent } from "@/lib/audit-context";
import { isoWeekdayLabel } from "@/lib/weekday-fr";

function validIsoDay(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, educatorId, educatorName, counterpartyOffDay } = body;

    if (!educatorId || !educatorName) {
      return NextResponse.json({ error: "Profil requis" }, { status: 400 });
    }

    const educators = await getEducators();
    const me = educators.find((e) => e.id === educatorId);
    if (!me || me.role !== "educatrice") {
      return NextResponse.json(
        { error: "Réservé aux éducatrices." },
        { status: 403 }
      );
    }

    if (action === "cancel") {
      const result = await cancelDayOffSwap(id, educatorId);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result.swap);
    }

    if (action !== "accept") {
      return NextResponse.json({ error: "Action non reconnue." }, { status: 400 });
    }

    const dayNum =
      typeof counterpartyOffDay === "string"
        ? parseInt(counterpartyOffDay, 10)
        : counterpartyOffDay;
    if (!validIsoDay(dayNum)) {
      return NextResponse.json(
        { error: "Indiquez votre journée de congé actuelle (lundi à dimanche)." },
        { status: 400 }
      );
    }

    const result = await acceptDayOffSwap({
      swapId: id,
      accepterId: educatorId,
      accepterName: educatorName,
      counterpartyOffDay: dayNum,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    const s = result.swap;
    try {
      await createAuditLog({
        educatorId: s.requesterId,
        educatorName: s.requesterName,
        action: AUDIT_ACTIONS.DAY_OFF_SWAP_CONFIRMED,
        resourceType: "DayOffSwapRequest",
        resourceId: s.id,
        detail: JSON.stringify({
          requester: s.requesterName,
          requesterDay: isoWeekdayLabel(s.requesterOffDay),
          requesterQualified: s.requesterIsQualified,
          counterparty: s.acceptedByName,
          counterpartyDay: isoWeekdayLabel(s.counterpartyOffDay ?? dayNum),
          mode: s.mode,
        }),
        ip: getClientIp(request),
        userAgent: getUserAgent(request),
      });
    } catch (err) {
      console.error("Day-off swap audit failed:", err);
    }

    return NextResponse.json(result.swap);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      adminId?: string;
    };
    const adminId = body.adminId?.trim();
    if (!adminId) {
      return NextResponse.json(
        { error: "Identifiant administrateur requis." },
        { status: 400 }
      );
    }
    const educators = await getEducators();
    const adminUser = educators.find((e) => e.id === adminId && e.role === "admin");
    if (!adminUser) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }
    const existing = await getDayOffSwapRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }
    try {
      await createAuditLog({
        educatorId: adminUser.id,
        educatorName: adminUser.name,
        action: AUDIT_ACTIONS.DAY_OFF_SWAP_DELETED_ADMIN,
        resourceType: "DayOffSwapRequest",
        resourceId: id,
        detail: JSON.stringify({
          requesterId: existing.requesterId,
          requesterName: existing.requesterName,
          status: existing.status,
          requesterOffDay: existing.requesterOffDay,
        }),
        ip: getClientIp(request),
        userAgent: getUserAgent(request),
      });
    } catch (e) {
      console.error("Audit day-off swap delete:", e);
    }
    await deleteDayOffSwapRequest(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
