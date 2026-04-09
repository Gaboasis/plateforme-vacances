export type RequestStatus = "pending" | "accepted" | "rejected";

export interface Educator {
  id: string;
  name: string;
  email: string;
  role: "educatrice" | "admin" | "cuisiniere" | "entretien" | "secretaire";
  /** Rang d'ancienneté (1 = plus ancienne, 15 = plus récente) */
  seniorityRank?: number;
  /** Éducatrice qualifiée (diplôme reconnu) ou non qualifiée */
  isQualified?: boolean;
  /** Hash du mot de passe (jamais exposé au client) */
  passwordHash?: string;
}

export interface VacationRequest {
  id: string;
  educatorId: string;
  educatorName: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: RequestStatus;
  createdAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  /** Raison d'urgence motivée soumise par l'éducatrice */
  urgentAppealReason?: string;
  /** Date de traitement de l'appel par l'admin */
  appealReviewedAt?: string;
}

/** Règles pour une semaine - index 0-51 = semaines 1-52, appliquées à chaque jour */
export interface BiWeekRuleOverrides {
  maxConcurrentVacations?: number;
  minQualifiedPresent?: number;
  minNonQualifiedPresent?: number;
}

/** Déclaration maladie (simple avis à l’administration, hors règles congés) */
export interface SickLeaveReport {
  id: string;
  educatorId: string;
  educatorName: string;
  startDate: string;
  endDate: string;
  note?: string;
  /** Présence d’une pièce jointe (détail via GET /api/sick-leaves/[id]/attachment) */
  hasAttachment: boolean;
  attachmentName?: string;
  /** Déclaration explicite : pas de document médical à joindre */
  declaredNoAttachment?: boolean;
  createdAt: string;
}

/** Entrée du journal d’audit (soumissions traçables côté serveur) */
export interface ActivityAuditLogEntry {
  id: string;
  educatorId: string;
  educatorName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  detail?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface VacationRules {
  maxConcurrentVacations: number;
  minAdvanceNoticeDays: number;
  maxConsecutiveDays: number;
  blackoutDates: string[];
  maxRequestsPerMonth: number;
  maxRequestsPerYear: number;

  /**
   * Plafond de jours de congés **acceptés** cumulés sur l’année civile (périodes fusionnées
   * si elles se chevauchent ou se touchent). Au-delà, nouvelle demande refusée automatiquement
   * (même parcours urgence motivée / admin que les autres refus).
   */
  maxAcceptedVacationDaysPerYear?: number;
  /**
   * Nombre maximal de demandes **acceptées** dont la date de début tombe dans l’année civile
   * de la période demandée. Au-delà, refus automatique (sauf urgence approuvée par l’admin).
   */
  maxAcceptedRequestsPerYear?: number;

  /** Ratio qualifiées / non qualifiées */
  minQualifiedPresent: number;
  minNonQualifiedPresent: number;

  /** Priorité à l'ancienneté : en cas de conflit, la plus ancienne l'emporte */
  seniorityPriorityEnabled: boolean;

  /** 52 règles (une par semaine, appliquées à chaque jour) */
  biWeekRules: (BiWeekRuleOverrides | null)[];
}
