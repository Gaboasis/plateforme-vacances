import { addDays, differenceInDays, isWithinInterval, parseISO } from "date-fns";
import type { Educator, VacationRequest, VacationRules } from "@/types";
import { isDemoEducatorId } from "./demo-educator";
import {
  clipIntervalToVacationYear,
  formatVacationYearLabel,
  getVacationYearStartYear,
  isDateInVacationYear,
} from "./vacation-year";
import {
  analyzeVacationPeriodByDay,
  formatConflictDatesList,
} from "./vacation-day-capacity";

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
  /** Jours où la limite simultanée / effectif bloque la demande */
  conflictingDates?: string[];
  /** Périodes contiguës disponibles dans la demande initiale */
  suggestedPeriods?: { startDate: string; endDate: string }[];
}

/** Fusion des périodes qui se chevauchent ou se suivent (jour contigu), puis somme des jours */
function mergedVacationDaysInYear(
  intervals: { s: Date; e: Date }[]
): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.s.getTime() - b.s.getTime());
  let cs = sorted[0].s;
  let ce = sorted[0].e;
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const { s, e } = sorted[i];
    if (s <= addDays(ce, 1)) {
      if (e > ce) ce = e;
    } else {
      total += differenceInDays(ce, cs) + 1;
      cs = s;
      ce = e;
    }
  }
  total += differenceInDays(ce, cs) + 1;
  return total;
}

function projectedAcceptedVacationDaysInYear(
  educatorId: string,
  vacationYearStart: number,
  vacationRequests: VacationRequest[],
  proposedStart: Date,
  proposedEnd: Date
): number {
  const clips: { s: Date; e: Date }[] = [];
  for (const r of vacationRequests) {
    if (r.educatorId !== educatorId || r.status !== "accepted") continue;
    try {
      const rs = parseISO(r.startDate);
      const re = parseISO(r.endDate);
      const c = clipIntervalToVacationYear(rs, re, vacationYearStart);
      if (c) clips.push(c);
    } catch {
      /* skip */
    }
  }
  const prop = clipIntervalToVacationYear(
    proposedStart,
    proposedEnd,
    vacationYearStart
  );
  if (prop) clips.push(prop);
  return mergedVacationDaysInYear(clips);
}

function acceptedRequestCountForYear(
  educatorId: string,
  vacationYearStart: number,
  vacationRequests: VacationRequest[]
): number {
  return vacationRequests.filter((r) => {
    if (r.educatorId !== educatorId || r.status !== "accepted") return false;
    try {
      return isDateInVacationYear(
        parseISO(r.startDate),
        vacationYearStart
      );
    } catch {
      return false;
    }
  }).length;
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

  /** Congés du compte démo : exclus des calculs d’effectif / places pour les autres éducatrices */
  const poolExcludingDemoAccepts = vacationRequests.filter(
    (r) => !isDemoEducatorId(r.educatorId)
  );

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
      r.status !== "rejected" &&
      r.status !== "cancelled"
  );
  if (requestsThisMonth.length >= rules.maxRequestsPerMonth) {
    return {
      valid: false,
      reason: `Vous avez déjà ${rules.maxRequestsPerMonth} demande(s) ce mois-ci.`,
    };
  }

  // Nombre de demandes sur l’année de congés en cours (1 avr → 31 mars)
  const currentVacationYear = getVacationYearStartYear(today);
  const maxPerYear = rules.maxRequestsPerYear ?? 2;
  const requestsThisYear = vacationRequests.filter(
    (r) =>
      r.educatorId === request.educatorId &&
      isDateInVacationYear(new Date(r.createdAt), currentVacationYear) &&
      r.status !== "rejected" &&
      r.status !== "cancelled"
  );
  if (requestsThisYear.length >= maxPerYear) {
    return {
      valid: false,
      reason: `Vous avez déjà ${maxPerYear} demande(s) sur la période ${formatVacationYearLabel(currentVacationYear)}.`,
    };
  }

  const vacationYearStart = getVacationYearStartYear(start);
  const yearLabel = formatVacationYearLabel(vacationYearStart);
  const dayCap = rules.maxAcceptedVacationDaysPerYear;
  if (dayCap != null && dayCap > 0) {
    const projectedDays = projectedAcceptedVacationDaysInYear(
      request.educatorId,
      vacationYearStart,
      vacationRequests,
      start,
      end
    );
    if (projectedDays > dayCap) {
      return {
        valid: false,
        reason: `Vous avez atteint le plafond de ${dayCap} jours de congés acceptés sur la période ${yearLabel} (ou la demande le ferait dépasser). Vous pouvez motiver une urgence pour que l'administration l'examine.`,
      };
    }
  }

  const acceptedSlotCap = rules.maxAcceptedRequestsPerYear;
  if (acceptedSlotCap != null && acceptedSlotCap > 0) {
    const acceptedSoFar = acceptedRequestCountForYear(
      request.educatorId,
      vacationYearStart,
      vacationRequests
    );
    if (acceptedSoFar >= acceptedSlotCap) {
      return {
        valid: false,
        reason: `Vous avez déjà ${acceptedSlotCap} demande(s) acceptée(s) sur la période ${yearLabel}. Vous pouvez motiver une urgence pour que l'administration examine une demande supplémentaire.`,
      };
    }
  }

  const requester = educators.find((e) => e.id === request.educatorId);
  const isEducatrice = requester?.role === "educatrice";

  // Cuisinière et entretien : règles de base appliquées, limite simultanée non applicable,
  // demande toujours en attente pour examen par l'administration
  if (!isEducatrice) {
    return { valid: true, requiresManualReview: true };
  }

  if (!requester) {
    return { valid: false, reason: "Profil éducatrice introuvable." };
  }

  const analysis = analyzeVacationPeriodByDay(
    request.startDate,
    request.endDate,
    requester,
    rules,
    poolExcludingDemoAccepts,
    educators
  );

  if (analysis.allDaysOk) {
    return {
      valid: true,
      requiresManualReview: analysis.requiresManualReview,
    };
  }

  const conflictList = formatConflictDatesList(analysis.conflictingDates);
  const hasSuggestions = analysis.suggestedPeriods.length > 0;

  let reason: string;
  if (analysis.conflictingDates.length > 0 && hasSuggestions) {
    reason = `Certaines dates dépassent la limite de congés simultanés ou l'effectif minimum (${conflictList}). D'autres jours de votre demande restent disponibles — choisissez une période suggérée ci-dessous.`;
  } else if (analysis.conflictingDates.length > 0) {
    reason = `Aucun jour disponible dans cette période (${conflictList}). Maximum ${rules.maxConcurrentVacations} personne(s) en vacances simultanément par jour, ou effectif insuffisant.`;
  } else {
    reason = `Il doit rester assez d'éducatrices qualifiées ou non qualifiées présentes chaque jour de la période.`;
  }

  return {
    valid: false,
    reason,
    conflictingDates: analysis.conflictingDates,
    suggestedPeriods: analysis.suggestedPeriods,
  };
}
