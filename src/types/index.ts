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
}

/** Règles pour une semaine - index 0-51 = semaines 1-52, appliquées à chaque jour */
export interface BiWeekRuleOverrides {
  maxConcurrentVacations?: number;
  minQualifiedPresent?: number;
  minNonQualifiedPresent?: number;
}

export interface VacationRules {
  maxConcurrentVacations: number;
  minAdvanceNoticeDays: number;
  maxConsecutiveDays: number;
  blackoutDates: string[];
  maxRequestsPerMonth: number;
  maxRequestsPerYear: number;

  /** Ratio qualifiées / non qualifiées */
  minQualifiedPresent: number;
  minNonQualifiedPresent: number;

  /** Priorité à l'ancienneté : en cas de conflit, la plus ancienne l'emporte */
  seniorityPriorityEnabled: boolean;

  /** 52 règles (une par semaine, appliquées à chaque jour) */
  biWeekRules: (BiWeekRuleOverrides | null)[];
}
