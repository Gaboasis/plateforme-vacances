import type { AccountingConfig, JournalLineCategory } from "@/types";
import { computeGrossFromHours } from "./money";
import {
  computeEmployerCotisationForJournal,
} from "./quebec-employer-contributions";
import {
  indemnityCentsFromGross,
  normalizeVacationIndemnityPercent,
} from "./payroll-indemnities";

export type EducatorPayrollContext = {
  id: string;
  name: string;
  hourlyRateCents?: number;
  vacationIndemnityPercent?: number;
  employerContributionPercent?: number;
};

export type PayrollJournalLineDraft = {
  kind: "expense";
  category: JournalLineCategory;
  label: string;
  amountCents: number;
  educatorId: string;
  educatorName: string;
  hoursWorked: number;
  hourlyRateCents: number;
  employerContributionPercent?: number;
};

const PAYROLL_CATEGORIES: JournalLineCategory[] = [
  "expense_educator_gross",
  "expense_employer_cotisation",
  "expense_vacation_indemnity",
  "expense_sick_leave_indemnity",
];

export function isPayrollJournalCategory(category: string): boolean {
  return PAYROLL_CATEGORIES.includes(category as JournalLineCategory);
}

/** Lignes paie journalières pour une éducatrice (heures déjà payables). */
export function buildEducatorPayrollJournalLines(
  edu: EducatorPayrollContext,
  hours: number,
  config: AccountingConfig
): PayrollJournalLineDraft[] {
  const rate = edu.hourlyRateCents ?? 0;
  if (!Number.isFinite(hours) || hours <= 0 || rate <= 0) return [];

  const gross = computeGrossFromHours(hours, rate);
  const cot = computeEmployerCotisationForJournal(
    gross,
    config,
    edu.employerContributionPercent
  );
  const vacPct = normalizeVacationIndemnityPercent(edu.vacationIndemnityPercent);
  const vacCents = indemnityCentsFromGross(gross, vacPct);
  const sickPct = config.sickLeaveIndemnityPercent ?? 0.8;
  const sickCents = indemnityCentsFromGross(gross, sickPct);

  const lines: PayrollJournalLineDraft[] = [
    {
      kind: "expense",
      category: "expense_educator_gross",
      label: `Salaire — ${edu.name}`,
      amountCents: gross,
      educatorId: edu.id,
      educatorName: edu.name,
      hoursWorked: hours,
      hourlyRateCents: rate,
      employerContributionPercent: cot.effectivePercent,
    },
  ];

  if (cot.totalCents > 0) {
    const cotLabel =
      config.employerContributionMethod === "quebec_statutory"
        ? `Cotisations employeur (QC) — ${edu.name}`
        : `Cotisations employeur — ${edu.name}`;
    lines.push({
      kind: "expense",
      category: "expense_employer_cotisation",
      label: cotLabel,
      amountCents: cot.totalCents,
      educatorId: edu.id,
      educatorName: edu.name,
      hoursWorked: hours,
      hourlyRateCents: rate,
      employerContributionPercent: cot.effectivePercent,
    });
  }

  if (vacCents > 0) {
    lines.push({
      kind: "expense",
      category: "expense_vacation_indemnity",
      label: `Indemnité vacances (${vacPct} %) — ${edu.name}`,
      amountCents: vacCents,
      educatorId: edu.id,
      educatorName: edu.name,
      hoursWorked: hours,
      hourlyRateCents: rate,
      employerContributionPercent: vacPct,
    });
  }

  if (sickCents > 0) {
    lines.push({
      kind: "expense",
      category: "expense_sick_leave_indemnity",
      label: `Provision maladie (${sickPct} %) — ${edu.name}`,
      amountCents: sickCents,
      educatorId: edu.id,
      educatorName: edu.name,
      hoursWorked: hours,
      hourlyRateCents: rate,
      employerContributionPercent: sickPct,
    });
  }

  return lines;
}
