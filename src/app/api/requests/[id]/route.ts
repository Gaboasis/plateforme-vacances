import { NextRequest, NextResponse } from "next/server";
import {
  getEducators,
  getVacationRequestById,
  updateVacationRequest,
  deleteVacationRequest,
  AUDIT_ACTIONS,
  createAuditLog,
} from "@/lib/store";
import { getClientIp, getUserAgent } from "@/lib/audit-context";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      status,
      rejectionReason,
      urgentAppealReason,
      educatorId,
      clearCancellationPending,
    } = body;

    const existing = await getVacationRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    if (clearCancellationPending === true) {
      if (!existing.cancellationPendingAt) {
        return NextResponse.json(
          { error: "Aucune demande d’annulation en attente." },
          { status: 400 }
        );
      }
      const updated = await updateVacationRequest(id, { cancellationPendingAt: null });
      return NextResponse.json(updated);
    }

    // Soumission d'une urgence motivée par l'éducatrice
    if (urgentAppealReason != null && educatorId != null) {
      if (existing.educatorId !== educatorId) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
      }
      if (existing.status !== "rejected") {
        return NextResponse.json({ error: "Cette demande n'est pas refusée" }, { status: 400 });
      }
      if (existing.appealReviewedAt) {
        return NextResponse.json({ error: "Votre appel a déjà été traité" }, { status: 400 });
      }
      const updated = await updateVacationRequest(id, {
        urgentAppealReason: urgentAppealReason.trim() || undefined,
      });
      await createAuditLog({
        educatorId,
        educatorName: existing.educatorName,
        action: AUDIT_ACTIONS.VACATION_URGENT_APPEAL,
        resourceType: "VacationRequest",
        resourceId: id,
        detail: JSON.stringify({
          appealPreview: String(urgentAppealReason).trim().slice(0, 200),
        }),
        ip: getClientIp(request),
        userAgent: getUserAgent(request),
      });
      return NextResponse.json(updated);
    }

    // Mise à jour par l'admin (accepter/refuser/annuler congé accepté)
    const updates: Parameters<typeof updateVacationRequest>[1] = {
      status: status ?? existing.status,
      rejectionReason: rejectionReason ?? existing.rejectionReason,
    };
    // Si l'admin accepte ou refuse un appel, marquer comme traité
    if (status === "accepted" || status === "rejected") {
      if (existing.urgentAppealReason && !existing.appealReviewedAt) {
        updates.appealReviewedAt = new Date().toISOString();
      }
    }
    const updated = await updateVacationRequest(id, updates);
    if (status === "cancelled" && existing.status === "accepted") {
      try {
        await createAuditLog({
          educatorId: existing.educatorId,
          educatorName: existing.educatorName,
          action: AUDIT_ACTIONS.VACATION_CANCELLED_ADMIN,
          resourceType: "VacationRequest",
          resourceId: id,
          detail: JSON.stringify({
            startDate: existing.startDate,
            endDate: existing.endDate,
            hadPendingRequest: Boolean(existing.cancellationPendingAt),
          }),
          ip: getClientIp(request),
          userAgent: getUserAgent(request),
        });
      } catch (e) {
        console.error("Audit admin cancel:", e);
      }
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** Suppression définitive en base (admin uniquement) — disparaît côté employé et admin. */
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
    const existing = await getVacationRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }
    try {
      await createAuditLog({
        educatorId: adminUser.id,
        educatorName: adminUser.name,
        action: AUDIT_ACTIONS.VACATION_DELETED_ADMIN,
        resourceType: "VacationRequest",
        resourceId: id,
        detail: JSON.stringify({
          targetEducatorId: existing.educatorId,
          targetEducatorName: existing.educatorName,
          status: existing.status,
          startDate: existing.startDate,
          endDate: existing.endDate,
        }),
        ip: getClientIp(request),
        userAgent: getUserAgent(request),
      });
    } catch (e) {
      console.error("Audit vacation delete:", e);
    }
    await deleteVacationRequest(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
