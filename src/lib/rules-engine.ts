import { differenceInDays, isWithinInterval, parseISO } from "date-fns";
import type { Educator, VacationRequest, VacationRules } from "@/types";
import { getBiWeekFromDate } from "./biweek";

export interface ValidationContext {
  rules: VacationRules;
  vacationRequests: VacationRequest[];
  educators: Educator[];
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  /** Demande valide mais dernière place : admin doit évaluer manuellement */
  requiresManualReview?: boolean;
}

/** Récupère les règles applicables pour une date donnée (selon la semaine) */
function getRulesForDate(
  date: Date,
  rules: VacationRules
): {
  maxConcurrent: number;
  minQualified: number;
  minNonQualified: number;
} {
  const biWeek = getBiWeekFromDate(date);
  const override = rules.biWeekRules?.[biWeek - 1];
  if (override) {
    return {
      maxConcurrent:
        override.maxConcurrentVacations ?? rules.maxConcurrentVacations,
      minQualified:
        override.minQualifiedPresent ?? rules.minQualifiedPresent,
      minNonQualified:
        override.minNonQualifiedPresent ?? rules.minNonQualifiedPresent,
    };
  }
  return {
    maxConcurrent: rules.maxConcurrentVacations,
    minQualified: rules.minQualifiedPresent,
    minNonQualified: rules.minNonQualifiedPresent,
  };
}

/** Vérifie les règles pour toute la période (prend le plus restrictif) */
function getPeriodRules(
  start: Date,
  end: Date,
  rules: VacationRules
): { maxConcurrent: number; minQualified: number; minNonQualified: number } {
  let maxConcurrent = rules.maxConcurrentVacations;
  let minQualified = rules.minQualifiedPresent;
  let minNonQualified = rules.minNonQualifiedPresent;

  const current = new Date(start);
  while (current <= end) {
    const dayRules = getRulesForDate(current, rules);
    maxConcurrent = Math.min(maxConcurrent, dayRules.maxConcurrent);
    minQualified = Math.max(minQualified, dayRules.minQualified);
    minNonQualified = Math.max(minNonQualified, dayRules.minNonQualified);
    current.setDate(current.getDate() + 1);
  }

  return { maxConcurrent, minQualified, minNonQualified };
}

function overlaps(
  req: VacationRequest,
  start: Date,
  end: Date
): boolean {
  if (req.status !== "accepted") return false;
  try {
    const rStart = parseISO(req.startDate);
    const rEnd = parseISO(req.endDate);
    return (
      isWithinInterval(start, { start: rStart, end: rEnd }) ||
      isWithinInterval(end, { start: rStart, end: rEnd }) ||
      (rStart >= start && rEnd <= end)
    );
  } catch {
    return false;
  }
}

export function validateVacationRequest(
  request: Omit<VacationRequest, "id" | "createdAt" | "status">,
  context: ValidationContext
): ValidationResult {
  const { rules, vacationRequests, educators } = context;
  const start = parseISO(request.startDate);
  const end = parseISO(request.endDate);
  const today = new Date();

  // Vérifier l'ordre des dates
  if (start > end) {
    return {
      valid: false,
      reason: "La date de fin doit être après la date de début.",
    };
  }

  const periodRules = getPeriodRules(start, end, rules);

  // Préavis minimum
  const noticeDays = differenceInDays(start, today);
  if (noticeDays < rules.minAdvanceNoticeDays) {
    return {
      valid: false,
      reason: `Vous devez demander vos vacances au moins ${rules.minAdvanceNoticeDays} jours à l'avance.`,
    };
  }

  // Jours consécutifs maximum
  const requestedDays = differenceInDays(end, start) + 1;
  if (requestedDays > rules.maxConsecutiveDays) {
    return {
      valid: false,
      reason: `La durée maximale autorisée est de ${rules.maxConsecutiveDays} jours consécutifs.`,
    };
  }

  // Dates interdites
  for (const blackout of rules.blackoutDates || []) {
    try {
      const blackoutDate = parseISO(blackout);
      if (
        isWithinInterval(blackoutDate, { start, end }) ||
        blackoutDate.getTime() === start.getTime() ||
        blackoutDate.getTime() === end.getTime()
      ) {
        return {
          valid: false,
          reason: `La période demandée chevauche une date interdite (${blackout}).`,
        };
      }
    } catch {
      // skip invalid date
    }
  }

  // Nombre de demandes ce mois-ci
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const requestsThisMonth = vacationRequests.filter(
    (r) =>
      r.educatorId === request.educatorId &&
      new Date(r.createdAt) >= monthStart &&
      r.status !== "rejected"
  );
  if (requestsThisMonth.length >= rules.maxRequestsPerMonth) {
    return {
      valid: false,
      reason: `Vous avez déjà ${rules.maxRequestsPerMonth} demande(s) ce mois-ci.`,
    };
  }

  // Nombre de demandes cette année
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const maxPerYear = rules.maxRequestsPerYear ?? 2;
  const requestsThisYear = vacationRequests.filter(
    (r) =>
      r.educatorId === request.educatorId &&
      new Date(r.createdAt) >= yearStart &&
      r.status !== "rejected"
  );
  if (requestsThisYear.length >= maxPerYear) {
    return {
      valid: false,
      reason: `Vous avez déjà ${maxPerYear} demande(s) cette année.`,
    };
  }

  const requester = educators.find((e) => e.id === request.educatorId);
  const isEducatrice = requester?.role === "educatrice";

  // Cuisinière et entretien : règles de base appliquées, limite simultanée non applicable,
  // demande toujours en attente pour examen par l'administration
  if (!isEducatrice) {
    return { valid: true, requiresManualReview: true };
  }

  // Compter les éducatrices qualifiées / non qualifiées
  const educatorIds = educators
    .filter((e) => e.role === "educatrice")
    .map((e) => e.id);
  const qualifiedCount = educators.filter(
    (e) => e.role === "educatrice" && e.isQualified
  ).length;
  const nonQualifiedCount = educatorIds.length - qualifiedCount;

  const requesterQualified = requester?.isQualified ?? false;

  // Vacances acceptées pendant la période demandée
  const overlappingAccepted = vacationRequests.filter((r) =>
    overlaps(r, start, end)
  );

  // Éducatrices uniques en vacances pendant cette période (par statut)
  const qualifiedOnVacation = new Set(
    overlappingAccepted
      .filter((r) => {
        const ed = educators.find((e) => e.id === r.educatorId);
        return ed && ed.role === "educatrice" && ed.isQualified;
      })
      .map((r) => r.educatorId)
  ).size;
  const nonQualifiedOnVacation = new Set(
    overlappingAccepted
      .filter((r) => {
        const ed = educators.find((e) => e.id === r.educatorId);
        return ed && ed.role === "educatrice" && !ed.isQualified;
      })
      .map((r) => r.educatorId)
  ).size;

  // Avec la nouvelle demande acceptée :
  const qualifiedAway = qualifiedOnVacation + (requesterQualified ? 1 : 0);
  const nonQualifiedAway =
    nonQualifiedOnVacation + (requesterQualified ? 0 : 1);

  if (qualifiedCount - qualifiedAway < periodRules.minQualified) {
    return {
      valid: false,
      reason: `Il doit rester au moins ${periodRules.minQualified} éducatrice(s) qualifiée(s) présente(s).`,
    };
  }
  if (nonQualifiedCount - nonQualifiedAway < periodRules.minNonQualified) {
    return {
      valid: false,
      reason: `Il doit rester au moins ${periodRules.minNonQualified} éducatrice(s) non qualifiée(s) présente(s).`,
    };
  }

  // Vacances simultanées (nombre de personnes différentes)
  const uniqueOverlapping = new Set(
    overlappingAccepted.map((r) => r.educatorId)
  );

  if (uniqueOverlapping.size < periodRules.maxConcurrent) {
    const isLastSpot =
      uniqueOverlapping.size === periodRules.maxConcurrent - 1;
    const needsManualReview =
      periodRules.maxConcurrent >= 3 && isLastSpot;

    return {
      valid: true,
      requiresManualReview: needsManualReview,
    };
  }

  // À la limite : on refuse la nouvelle demande (première arrivée, première servie)
  // Pas de « bump » : on ne retire jamais un congé déjà accepté
  return {
    valid: false,
    reason: `Maximum ${periodRules.maxConcurrent} personne(s) en vacances simultanément pendant cette période.`,
  };
}
