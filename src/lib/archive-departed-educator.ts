import { prisma } from "./db";
import { createAuditLog, AUDIT_ACTIONS } from "./store";

export type ArchiveEducatorSummary = {
  fromEducatorId: string;
  fromEducatorName: string;
  archivedToEducatorId: string;
  archivedToEducatorName: string;
  vacationRequests: number;
  sickLeaveReports: number;
  dayOffSwapsAsRequester: number;
  dayOffSwapsAsAccepter: number;
  dayOffSwapsTargetCancelled: number;
  activityAuditLogs: number;
  dryRun: boolean;
};

const NON_ARCHIVABLE_IDS = new Set(["admin", "demo-visite"]);

export async function archiveDepartedEducator(options: {
  fromEducatorId: string;
  archiveToEducatorId?: string;
  dryRun?: boolean;
  actorEducatorId?: string;
}): Promise<ArchiveEducatorSummary> {
  const fromId = options.fromEducatorId.trim();
  const toId = (options.archiveToEducatorId ?? "admin").trim();
  const dryRun = options.dryRun === true;

  if (!fromId) {
    throw new Error("Identifiant de l’employé·e à archiver requis.");
  }
  if (fromId === toId) {
    throw new Error("Impossible d’archiver un compte vers lui-même.");
  }
  if (NON_ARCHIVABLE_IDS.has(fromId)) {
    throw new Error("Ce profil ne peut pas être archivé.");
  }

  const [from, to] = await Promise.all([
    prisma.educator.findUnique({ where: { id: fromId } }),
    prisma.educator.findUnique({ where: { id: toId } }),
  ]);

  if (!from) {
    throw new Error(`Profil introuvable : ${fromId}`);
  }
  if (!to || to.role !== "admin") {
    throw new Error("Le compte de destination doit être un administrateur.");
  }
  if (from.role === "admin") {
    throw new Error("Le compte administrateur ne peut pas être archivé.");
  }

  const [
    vacationRequests,
    sickLeaveReports,
    dayOffSwapsAsRequester,
    dayOffSwapsAsAccepter,
    dayOffSwapsTargetCancelled,
    activityAuditLogs,
  ] = await Promise.all([
    prisma.vacationRequest.count({ where: { educatorId: fromId } }),
    prisma.sickLeaveReport.count({ where: { educatorId: fromId } }),
    prisma.dayOffSwapRequest.count({ where: { requesterId: fromId } }),
    prisma.dayOffSwapRequest.count({ where: { acceptedById: fromId } }),
    prisma.dayOffSwapRequest.count({
      where: { targetEducatorId: fromId, status: "pending" },
    }),
    prisma.activityAuditLog.count({ where: { educatorId: fromId } }),
  ]);

  const summary: ArchiveEducatorSummary = {
    fromEducatorId: from.id,
    fromEducatorName: from.name,
    archivedToEducatorId: to.id,
    archivedToEducatorName: to.name,
    vacationRequests,
    sickLeaveReports,
    dayOffSwapsAsRequester,
    dayOffSwapsAsAccepter,
    dayOffSwapsTargetCancelled,
    activityAuditLogs,
    dryRun,
  };

  if (dryRun) return summary;

  await prisma.$transaction(async (tx) => {
    await tx.vacationRequest.updateMany({
      where: { educatorId: fromId },
      data: { educatorId: toId },
    });

    await tx.sickLeaveReport.updateMany({
      where: { educatorId: fromId },
      data: { educatorId: toId },
    });

    await tx.dayOffSwapRequest.updateMany({
      where: { requesterId: fromId },
      data: { requesterId: toId },
    });

    await tx.dayOffSwapRequest.updateMany({
      where: { acceptedById: fromId },
      data: { acceptedById: toId },
    });

    await tx.dayOffSwapRequest.updateMany({
      where: { targetEducatorId: fromId, status: "pending" },
      data: { status: "cancelled", updatedAt: new Date() },
    });

    await tx.activityAuditLog.updateMany({
      where: { educatorId: fromId },
      data: { educatorId: toId },
    });

    await tx.educator.delete({ where: { id: fromId } });
  });

  if (options.actorEducatorId) {
    try {
      await createAuditLog({
        educatorId: to.id,
        educatorName: to.name,
        action: AUDIT_ACTIONS.EDUCATOR_ARCHIVED,
        resourceType: "Educator",
        resourceId: fromId,
        detail: JSON.stringify({
          archivedName: from.name,
          archivedEmail: from.email,
          archivedRole: from.role,
          ...summary,
        }),
      });
    } catch (e) {
      console.error("Audit educator archive:", e);
    }
  }

  return summary;
}
