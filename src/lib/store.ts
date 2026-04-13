import type {
  ActivityAuditLogEntry,
  DayOffSwapRequest,
  Educator,
  SickLeaveReport,
  VacationRequest,
  VacationRules,
} from "@/types";
import { DEMO_EDUCATOR_ID } from "./demo-educator";
import { prisma } from "./db";

function educatorToType(edu: {
  id: string;
  name: string;
  email: string;
  role: string;
  seniorityRank: number | null;
  isQualified: boolean | null;
  passwordHash: string | null;
}): Educator {
  return {
    id: edu.id,
    name: edu.name,
    email: edu.email,
    role: edu.role as "educatrice" | "admin" | "cuisiniere" | "entretien" | "secretaire",
    seniorityRank: edu.seniorityRank ?? undefined,
    isQualified: edu.isQualified ?? undefined,
    passwordHash: edu.passwordHash ?? undefined,
  };
}

function requestToType(req: {
  id: string;
  educatorId: string;
  educatorName: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: string;
  rejectionReason: string | null;
  urgentAppealReason: string | null;
  appealReviewedAt: Date | null;
  createdAt: Date;
  reviewedAt: Date | null;
  cancelledAt: Date | null;
  cancellationPendingAt: Date | null;
}): VacationRequest {
  return {
    id: req.id,
    educatorId: req.educatorId,
    educatorName: req.educatorName,
    startDate: req.startDate.toISOString().slice(0, 10),
    endDate: req.endDate.toISOString().slice(0, 10),
    reason: req.reason ?? undefined,
    status: req.status as VacationRequest["status"],
    rejectionReason: req.rejectionReason ?? undefined,
    urgentAppealReason: req.urgentAppealReason ?? undefined,
    appealReviewedAt: req.appealReviewedAt?.toISOString(),
    createdAt: req.createdAt.toISOString(),
    reviewedAt: req.reviewedAt?.toISOString(),
    cancelledAt: req.cancelledAt?.toISOString(),
    cancellationPendingAt: req.cancellationPendingAt?.toISOString(),
  };
}

export async function getEducators(): Promise<Educator[]> {
  const list = await prisma.educator.findMany({ orderBy: { seniorityRank: "asc" } });
  return list.map(educatorToType);
}

export async function updateEducator(id: string, updates: Partial<Educator>) {
  const data: Record<string, unknown> = {};
  if (updates.name != null) data.name = updates.name;
  if (updates.email != null) data.email = updates.email;
  if (updates.role != null) data.role = updates.role;
  if (updates.seniorityRank != null) data.seniorityRank = updates.seniorityRank;
  if (updates.isQualified != null) data.isQualified = updates.isQualified;
  if (updates.passwordHash != null) data.passwordHash = updates.passwordHash;

  const updated = await prisma.educator.update({
    where: { id },
    data,
  });
  return educatorToType(updated);
}

const defaultRules: VacationRules = {
  maxConcurrentVacations: 2,
  minAdvanceNoticeDays: 14,
  maxConsecutiveDays: 15,
  blackoutDates: [],
  maxRequestsPerMonth: 2,
  maxRequestsPerYear: 2,
  maxAcceptedVacationDaysPerYear: 21,
  maxAcceptedRequestsPerYear: 3,
  minQualifiedPresent: 1,
  minNonQualifiedPresent: 0,
  seniorityPriorityEnabled: true,
  biWeekRules: Array(52).fill(null),
};

export async function getVacationRules(): Promise<VacationRules> {
  const row = await prisma.vacationRulesConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!row) return defaultRules;
  const rules = JSON.parse(row.rules) as Record<string, unknown>;
  return {
    ...defaultRules,
    ...rules,
    blackoutDates: Array.isArray(rules.blackoutDates) ? rules.blackoutDates : defaultRules.blackoutDates,
    biWeekRules: (() => {
      const arr = Array.isArray(rules.biWeekRules) ? rules.biWeekRules : [];
      if (arr.length === 26) {
        const expanded: (typeof defaultRules.biWeekRules)[0][] = [];
        for (let i = 0; i < 52; i++) expanded.push(arr[Math.floor(i / 2)] ?? null);
        return expanded;
      }
      const padded = arr.slice(0, 52);
      while (padded.length < 52) padded.push(null);
      return padded;
    })(),
  };
}

export async function setVacationRules(rules: Partial<VacationRules>) {
  const current = await getVacationRules();
  let biWeekRules = rules.biWeekRules ?? current.biWeekRules ?? Array(52).fill(null);
  if (Array.isArray(biWeekRules)) {
    const padded = biWeekRules.slice(0, 52);
    while (padded.length < 52) padded.push(null);
    biWeekRules = padded;
  }
  const merged = {
    ...current,
    ...rules,
    biWeekRules,
  };
  await prisma.vacationRulesConfig.upsert({
    where: { id: "default" },
    create: { rules: JSON.stringify(merged) },
    update: { rules: JSON.stringify(merged) },
  });
  return merged;
}

export async function addVacationRequest(
  request: Omit<VacationRequest, "id" | "createdAt" | "status">,
  status: VacationRequest["status"] = "accepted"
): Promise<VacationRequest> {
  const now = new Date();
  const req = await prisma.vacationRequest.create({
    data: {
      educatorId: request.educatorId,
      educatorName: request.educatorName,
      startDate: new Date(request.startDate),
      endDate: new Date(request.endDate),
      reason: request.reason,
      status,
      reviewedAt: status !== "pending" ? now : null,
    },
  });
  return requestToType(req);
}

export type VacationRequestUpdate = Partial<
  Omit<VacationRequest, "cancellationPendingAt">
> & {
  cancellationPendingAt?: string | null;
};

export async function updateVacationRequest(
  id: string,
  updates: VacationRequestUpdate
) {
  const existing = await prisma.vacationRequest.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Demande introuvable");
  }

  const data: Record<string, unknown> = {};
  if (updates.status != null) data.status = updates.status;
  if (updates.rejectionReason != null) data.rejectionReason = updates.rejectionReason;
  if (updates.urgentAppealReason != null) data.urgentAppealReason = updates.urgentAppealReason;
  if (updates.appealReviewedAt != null) data.appealReviewedAt = new Date(updates.appealReviewedAt);

  if ("cancellationPendingAt" in updates) {
    const v = updates.cancellationPendingAt;
    data.cancellationPendingAt =
      v === null || v === undefined ? null : new Date(v);
  }

  if (updates.status === "cancelled") {
    data.cancelledAt = new Date();
    data.cancellationPendingAt = null;
  }

  const newStatus = (updates.status ?? existing.status) as VacationRequest["status"];
  const isAppealResolution =
    Boolean(existing.urgentAppealReason) &&
    existing.appealReviewedAt == null &&
    updates.appealReviewedAt != null;

  // Date de la première acceptation / refus : une seule fois, pas écrasée lors du traitement d'une urgence motivée
  if (
    newStatus !== "pending" &&
    newStatus !== "cancelled" &&
    !isAppealResolution &&
    !existing.reviewedAt
  ) {
    data.reviewedAt = new Date();
  }

  const updated = await prisma.vacationRequest.update({
    where: { id },
    data,
  });
  return requestToType(updated);
}

export async function getVacationRequests(educatorId?: string): Promise<VacationRequest[]> {
  const where = educatorId ? { educatorId } : {};
  const list = await prisma.vacationRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return list.map(requestToType);
}

export async function getRequestsByEducator(educatorId: string): Promise<VacationRequest[]> {
  return getVacationRequests(educatorId);
}

export async function getVacationRequestById(id: string): Promise<VacationRequest | null> {
  const req = await prisma.vacationRequest.findUnique({
    where: { id },
  });
  return req ? requestToType(req) : null;
}

export async function deleteVacationRequest(id: string): Promise<void> {
  await prisma.vacationRequest.delete({ where: { id } });
}

/** Nombre d'urgences motivées en attente d'évaluation par l'admin */
export async function getPendingAppealsCount(): Promise<number> {
  const count = await prisma.vacationRequest.count({
    where: {
      status: "rejected",
      urgentAppealReason: { not: null },
      appealReviewedAt: null,
      educatorId: { not: DEMO_EDUCATOR_ID },
    },
  });
  return count;
}

function sickLeaveToPublic(row: {
  id: string;
  educatorId: string;
  educatorName: string;
  startDate: Date;
  endDate: Date;
  note: string | null;
  attachmentBase64: string | null;
  attachmentName: string | null;
  declaredNoAttachment: boolean;
  createdAt: Date;
}): SickLeaveReport {
  return {
    id: row.id,
    educatorId: row.educatorId,
    educatorName: row.educatorName,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    note: row.note ?? undefined,
    hasAttachment: Boolean(row.attachmentBase64),
    attachmentName: row.attachmentName ?? undefined,
    declaredNoAttachment: row.declaredNoAttachment,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createSickLeaveReport(data: {
  educatorId: string;
  educatorName: string;
  startDate: string;
  endDate: string;
  note?: string | null;
  attachmentBase64?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  declaredNoAttachment: boolean;
}): Promise<SickLeaveReport> {
  const row = await prisma.sickLeaveReport.create({
    data: {
      educatorId: data.educatorId,
      educatorName: data.educatorName,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      note: data.note?.trim() || null,
      attachmentBase64: data.attachmentBase64 ?? null,
      attachmentMime: data.attachmentMime ?? null,
      attachmentName: data.attachmentName ?? null,
      declaredNoAttachment: data.declaredNoAttachment,
    },
  });
  return sickLeaveToPublic(row);
}

export async function getSickLeaveReports(educatorId?: string): Promise<SickLeaveReport[]> {
  const where = educatorId ? { educatorId } : {};
  const list = await prisma.sickLeaveReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return list.map(sickLeaveToPublic);
}

export async function getSickLeaveReportByIdRaw(id: string) {
  return prisma.sickLeaveReport.findUnique({ where: { id } });
}

export async function deleteSickLeaveReport(id: string): Promise<void> {
  await prisma.sickLeaveReport.delete({ where: { id } });
}

export const AUDIT_ACTIONS = {
  VACATION_SUBMITTED: "vacation_request_submitted",
  SICK_LEAVE_SUBMITTED: "sick_leave_submitted",
  VACATION_URGENT_APPEAL: "vacation_urgent_appeal_submitted",
  USER_LOGIN_SUCCESS: "user_login_success",
  DAY_OFF_SWAP_CONFIRMED: "day_off_swap_confirmed",
  VACATION_CANCELLED_SELF: "vacation_cancelled_by_employee",
  VACATION_CANCEL_ADMIN_REQUESTED: "vacation_cancellation_admin_requested",
  VACATION_CANCELLED_ADMIN: "vacation_cancelled_by_admin",
  VACATION_DELETED_ADMIN: "vacation_deleted_by_admin",
  SICK_LEAVE_DELETED_ADMIN: "sick_leave_deleted_by_admin",
  DAY_OFF_SWAP_DELETED_ADMIN: "day_off_swap_deleted_by_admin",
} as const;

function dayOffSwapToType(row: {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterIsQualified: boolean;
  requesterOffDay: number;
  mode: string;
  targetEducatorId: string | null;
  targetEducatorName: string | null;
  status: string;
  acceptedById: string | null;
  acceptedByName: string | null;
  counterpartyOffDay: number | null;
  acceptedAt: Date | null;
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DayOffSwapRequest {
  return {
    id: row.id,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    requesterIsQualified: row.requesterIsQualified,
    requesterOffDay: row.requesterOffDay,
    mode: row.mode === "targeted" ? "targeted" : "open",
    targetEducatorId: row.targetEducatorId ?? undefined,
    targetEducatorName: row.targetEducatorName ?? undefined,
    status: row.status as DayOffSwapRequest["status"],
    acceptedById: row.acceptedById ?? undefined,
    acceptedByName: row.acceptedByName ?? undefined,
    counterpartyOffDay: row.counterpartyOffDay ?? undefined,
    acceptedAt: row.acceptedAt?.toISOString(),
    message: row.message ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getPendingSwapByRequester(
  requesterId: string
): Promise<DayOffSwapRequest | null> {
  const row = await prisma.dayOffSwapRequest.findFirst({
    where: { requesterId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return row ? dayOffSwapToType(row) : null;
}

export async function createDayOffSwapRequest(data: {
  requesterId: string;
  requesterName: string;
  requesterIsQualified: boolean;
  requesterOffDay: number;
  mode: "open" | "targeted";
  targetEducatorId?: string | null;
  targetEducatorName?: string | null;
  message?: string | null;
}): Promise<DayOffSwapRequest> {
  const row = await prisma.dayOffSwapRequest.create({
    data: {
      requesterId: data.requesterId,
      requesterName: data.requesterName,
      requesterIsQualified: data.requesterIsQualified,
      requesterOffDay: data.requesterOffDay,
      mode: data.mode,
      targetEducatorId: data.targetEducatorId ?? null,
      targetEducatorName: data.targetEducatorName ?? null,
      status: "pending",
      message: data.message?.trim() || null,
    },
  });
  return dayOffSwapToType(row);
}

export async function getDayOffSwapDashboard(educatorId: string): Promise<{
  inbox: DayOffSwapRequest[];
  outgoing: DayOffSwapRequest[];
  history: DayOffSwapRequest[];
}> {
  const viewerRow = await prisma.educator.findUnique({
    where: { id: educatorId },
    select: { isQualified: true },
  });
  const viewerQualified = viewerRow?.isQualified === true;

  const allInvolving = await prisma.dayOffSwapRequest.findMany({
    where: {
      OR: [
        { requesterId: educatorId },
        { acceptedById: educatorId },
        { targetEducatorId: educatorId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const typed = allInvolving.map(dayOffSwapToType);

  const inbox = typed.filter((s) => {
    if (s.status !== "pending") return false;
    if (s.mode === "open" && s.requesterId === educatorId) return false;
    if (s.mode === "targeted" && s.targetEducatorId !== educatorId) return false;
    if (!(s.mode === "open" || s.mode === "targeted")) return false;
    if (s.requesterIsQualified && !viewerQualified) return false;
    return true;
  });

  const outgoing = typed.filter(
    (s) => s.status === "pending" && s.requesterId === educatorId
  );

  const history = typed.filter(
    (s) =>
      s.status === "confirmed" &&
      (s.requesterId === educatorId || s.acceptedById === educatorId)
  );

  return { inbox, outgoing, history };
}

export async function getAllDayOffSwapRequests(
  limit = 200
): Promise<DayOffSwapRequest[]> {
  const list = await prisma.dayOffSwapRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  return list.map(dayOffSwapToType);
}

export async function getDayOffSwapRequestById(
  id: string
): Promise<DayOffSwapRequest | null> {
  const row = await prisma.dayOffSwapRequest.findUnique({ where: { id } });
  return row ? dayOffSwapToType(row) : null;
}

export async function deleteDayOffSwapRequest(id: string): Promise<void> {
  await prisma.dayOffSwapRequest.delete({ where: { id } });
}

export async function acceptDayOffSwap(params: {
  swapId: string;
  accepterId: string;
  accepterName: string;
  counterpartyOffDay: number;
}): Promise<{ ok: true; swap: DayOffSwapRequest } | { ok: false; error: string }> {
  const swap = await prisma.dayOffSwapRequest.findUnique({
    where: { id: params.swapId },
  });
  if (!swap || swap.status !== "pending") {
    return { ok: false, error: "Demande introuvable ou déjà traitée." };
  }
  if (swap.requesterId === params.accepterId) {
    return { ok: false, error: "Vous ne pouvez pas accepter votre propre demande." };
  }
  if (swap.mode === "targeted") {
    if (swap.targetEducatorId !== params.accepterId) {
      return { ok: false, error: "Cette demande est destinée à une autre collègue." };
    }
  }

  if (swap.requesterIsQualified) {
    const accepterRow = await prisma.educator.findUnique({
      where: { id: params.accepterId },
      select: { isQualified: true },
    });
    if (accepterRow?.isQualified !== true) {
      return {
        ok: false,
        error:
          "Cette demande est réservée aux éducatrices qualifiées. Seule une collègue qualifiée peut accepter.",
      };
    }
  }

  const updated = await prisma.dayOffSwapRequest.updateMany({
    where: { id: params.swapId, status: "pending" },
    data: {
      status: "confirmed",
      acceptedById: params.accepterId,
      acceptedByName: params.accepterName,
      counterpartyOffDay: params.counterpartyOffDay,
      acceptedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return {
      ok: false,
      error:
        "Une autre collègue a déjà accepté cette demande ou elle a été annulée.",
    };
  }

  const fresh = await prisma.dayOffSwapRequest.findUniqueOrThrow({
    where: { id: params.swapId },
  });
  return { ok: true, swap: dayOffSwapToType(fresh) };
}

export async function cancelDayOffSwap(
  swapId: string,
  requesterId: string
): Promise<{ ok: true; swap: DayOffSwapRequest } | { ok: false; error: string }> {
  const swap = await prisma.dayOffSwapRequest.findUnique({
    where: { id: swapId },
  });
  if (!swap) return { ok: false, error: "Demande introuvable." };
  if (swap.requesterId !== requesterId) {
    return { ok: false, error: "Seule la personne qui a fait la demande peut l’annuler." };
  }
  if (swap.status !== "pending") {
    return { ok: false, error: "Cette demande n’est plus en attente." };
  }
  const row = await prisma.dayOffSwapRequest.update({
    where: { id: swapId },
    data: { status: "cancelled" },
  });
  return { ok: true, swap: dayOffSwapToType(row) };
}

export async function createAuditLog(data: {
  educatorId: string;
  educatorName: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  await prisma.activityAuditLog.create({
    data: {
      educatorId: data.educatorId,
      educatorName: data.educatorName,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId ?? null,
      detail: data.detail ?? null,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
    },
  });
}

export async function getAuditLogs(
  limit = 300,
  options?: { actions?: string[] }
): Promise<ActivityAuditLogEntry[]> {
  const take = Math.min(Math.max(limit, 1), 1000);
  const where =
    options?.actions && options.actions.length > 0
      ? { action: { in: options.actions } }
      : undefined;
  const list = await prisma.activityAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });
  return list.map((row) => ({
    id: row.id,
    educatorId: row.educatorId,
    educatorName: row.educatorName,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId ?? undefined,
    detail: row.detail ?? undefined,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }));
}
