import { NextRequest, NextResponse } from "next/server";
import {
  getVacationRequestById,
  updateVacationRequest,
  AUDIT_ACTIONS,
  createAuditLog,
} from "@/lib/store";
import { getClientIp, getUserAgent } from "@/lib/audit-context";
import { canEmployeeSelfCancelAcceptedNow } from "@/lib/vacation-self-cancel";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { educatorId, action } = body as {
      educatorId?: string;
      action?: "self_cancel" | "request_admin";
    };

    if (!educatorId || !action) {
      return NextResponse.json(
        { error: "Profil et action requis" },
        { status: 400 }
      );
    }

    const existing = await getVacationRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }
    if (existing.educatorId !== educatorId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
    if (existing.status !== "accepted") {
      return NextResponse.json(
        { error: "Seules les demandes acceptées peuvent être annulées ainsi." },
        { status: 400 }
      );
    }

    if (action === "self_cancel") {
      if (!canEmployeeSelfCancelAcceptedNow(existing.createdAt, existing.startDate)) {
        return NextResponse.json(
          {
            error:
              "Le délai pour annuler seule est dépassé. Utilisez « Demander l’annulation à l’administration ».",
          },
          { status: 400 }
        );
      }
      const updated = await updateVacationRequest(id, { status: "cancelled" });
      try {
        await createAuditLog({
          educatorId,
          educatorName: existing.educatorName,
          action: AUDIT_ACTIONS.VACATION_CANCELLED_SELF,
          resourceType: "VacationRequest",
          resourceId: id,
          detail: JSON.stringify({
            startDate: existing.startDate,
            endDate: existing.endDate,
          }),
          ip: getClientIp(request),
          userAgent: getUserAgent(request),
        });
      } catch (e) {
        console.error("Audit vacation self-cancel:", e);
      }
      return NextResponse.json(updated);
    }

    if (action === "request_admin") {
      if (existing.cancellationPendingAt) {
        return NextResponse.json(
          { error: "Une demande d’annulation est déjà en attente auprès de l’administration." },
          { status: 400 }
        );
      }
      if (canEmployeeSelfCancelAcceptedNow(existing.createdAt, existing.startDate)) {
        return NextResponse.json(
          {
            error:
              "Vous pouvez encore annuler vous-même depuis cette page. Utilisez « Annuler mon congé ».",
          },
          { status: 400 }
        );
      }
      const updated = await updateVacationRequest(id, {
        cancellationPendingAt: new Date().toISOString(),
      });
      try {
        await createAuditLog({
          educatorId,
          educatorName: existing.educatorName,
          action: AUDIT_ACTIONS.VACATION_CANCEL_ADMIN_REQUESTED,
          resourceType: "VacationRequest",
          resourceId: id,
          detail: JSON.stringify({
            startDate: existing.startDate,
            endDate: existing.endDate,
          }),
          ip: getClientIp(request),
          userAgent: getUserAgent(request),
        });
      } catch (e) {
        console.error("Audit vacation cancel request:", e);
      }
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Action non reconnue" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
