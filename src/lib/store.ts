import type { Educator, VacationRequest, VacationRules } from "@/types";
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

export async function updateVacationRequest(
  id: string,
  updates: Partial<VacationRequest>
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

  const newStatus = (updates.status ?? existing.status) as VacationRequest["status"];
  const isAppealResolution =
    Boolean(existing.urgentAppealReason) &&
    existing.appealReviewedAt == null &&
    updates.appealReviewedAt != null;

  // Date de la première acceptation / refus : une seule fois, pas écrasée lors du traitement d'une urgence motivée
  if (newStatus !== "pending" && !isAppealResolution && !existing.reviewedAt) {
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

/** Nombre d'urgences motivées en attente d'évaluation par l'admin */
export async function getPendingAppealsCount(): Promise<number> {
  const count = await prisma.vacationRequest.count({
    where: {
      status: "rejected",
      urgentAppealReason: { not: null },
      appealReviewedAt: null,
    },
  });
  return count;
}
