import { NextRequest, NextResponse } from "next/server";
import {
  getVacationRequestById,
  updateVacationRequest,
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
    const { status, rejectionReason, urgentAppealReason, educatorId } = body;

    const existing = await getVacationRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
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

    // Mise à jour par l'admin (accepter/refuser)
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
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
