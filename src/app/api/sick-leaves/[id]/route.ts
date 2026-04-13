import { NextRequest, NextResponse } from "next/server";
import {
  getEducators,
  getSickLeaveReportByIdRaw,
  deleteSickLeaveReport,
  AUDIT_ACTIONS,
  createAuditLog,
} from "@/lib/store";
import { getClientIp, getUserAgent } from "@/lib/audit-context";

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
    const existing = await getSickLeaveReportByIdRaw(id);
    if (!existing) {
      return NextResponse.json({ error: "Déclaration introuvable" }, { status: 404 });
    }
    try {
      await createAuditLog({
        educatorId: adminUser.id,
        educatorName: adminUser.name,
        action: AUDIT_ACTIONS.SICK_LEAVE_DELETED_ADMIN,
        resourceType: "SickLeaveReport",
        resourceId: id,
        detail: JSON.stringify({
          targetEducatorId: existing.educatorId,
          targetEducatorName: existing.educatorName,
          startDate: existing.startDate.toISOString().slice(0, 10),
          endDate: existing.endDate.toISOString().slice(0, 10),
        }),
        ip: getClientIp(request),
        userAgent: getUserAgent(request),
      });
    } catch (e) {
      console.error("Audit sick leave delete:", e);
    }
    await deleteSickLeaveReport(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
