import { prisma } from "./db";
import {
  computeStatutoryHolidayIndemnitiesFromJournals,
  referencePayWindowForHoliday,
  type EducatorHolidayIndemnitySummary,
  type GrossByEducatorDay,
  type HolidayIndemnityLine,
} from "./quebec-statutory-holiday";

function parseDateOnly(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error("Date invalide.");
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export type EducatorPeriodPayStats = {
  educatorId: string;
  educatorName: string;
  totalGrossCents: number;
  daysWorked: number;
};

export type EducatorPayrollDetail = {
  educatorId: string;
  educatorName: string;
  totalHours: number;
  totalGrossCents: number;
  employerCotisationCents: number;
  vacationIndemnityCents: number;
  sickLeaveIndemnityCents: number;
  holidayIndemnityCents: number;
  vacationIndemnityPercent: 4 | 6;
};

export type ReportLineItem = {
  label: string;
  amountCents: number;
  journalDate?: string;
};

export type PeriodReport = {
  from: string;
  to: string;
  statutoryHolidayDates: string[];
  daysWithJournal: number;
  revenue: {
    enrollmentCents: number;
    otherCents: number;
    totalCents: number;
  };
  expenses: {
    educatorGrossCents: number;
    employerCotisationCents: number;
    vacationIndemnityCents: number;
    sickLeaveIndemnityCents: number;
    statutoryHolidayCents: number;
    otherDailyCents: number;
    fixedExpensesCents: number;
    totalCents: number;
  };
  netCents: number;
  educatorStats: EducatorPeriodPayStats[];
  educatorPayroll: EducatorPayrollDetail[];
  revenueLineItems: ReportLineItem[];
  journalExpenseItems: ReportLineItem[];
  holidayIndemnityLines: HolidayIndemnityLine[];
  holidayIndemnitiesByEducator: EducatorHolidayIndemnitySummary[];
  fixedExpenses: {
    id: string;
    label: string;
    amountCents: number;
    sourceName?: string;
    note?: string;
  }[];
};

function buildGrossByEducatorDay(
  journals: { journalDate: Date; lines: { kind: string; category: string; educatorId: string | null; educatorName: string | null; amountCents: number; hoursWorked: number | null }[] }[]
): GrossByEducatorDay {
  const map: GrossByEducatorDay = new Map();
  for (const j of journals) {
    const dayKey = j.journalDate.toISOString().slice(0, 10);
    for (const line of j.lines) {
      if (line.kind !== "expense" || line.category !== "expense_educator_gross") {
        continue;
      }
      if (!line.educatorId || line.amountCents <= 0) continue;
      if (line.hoursWorked == null || line.hoursWorked <= 0) continue;
      const byDay = map.get(line.educatorId) ?? new Map();
      const prev = byDay.get(dayKey) ?? {
        gross: 0,
        name: line.educatorName ?? line.educatorId,
      };
      prev.gross += line.amountCents;
      byDay.set(dayKey, prev);
      map.set(line.educatorId, byDay);
    }
  }
  return map;
}

function parseHolidayDates(raw: string[]): string[] {
  const out: string[] = [];
  for (const s of raw) {
    const t = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) out.push(t);
  }
  return Array.from(new Set(out)).sort();
}

export async function buildPeriodReport(options: {
  fromStr: string;
  toStr: string;
  statutoryHolidayDates: string[];
}): Promise<PeriodReport> {
  const from = parseDateOnly(options.fromStr);
  const to = parseDateOnly(options.toStr);
  if (from > to) throw new Error("La date de début doit précéder la fin.");

  const holidayDates = parseHolidayDates(options.statutoryHolidayDates);
  const holidaysInPeriod = holidayDates.filter(
    (d) => d >= options.fromStr && d <= options.toStr
  );

  const journals = await prisma.dailyJournal.findMany({
    where: { journalDate: { gte: from, lte: to } },
    include: { lines: true },
    orderBy: { journalDate: "asc" },
  });

  const revenue = {
    enrollmentCents: 0,
    otherCents: 0,
    totalCents: 0,
  };

  const expenses = {
    educatorGrossCents: 0,
    employerCotisationCents: 0,
    vacationIndemnityCents: 0,
    sickLeaveIndemnityCents: 0,
    statutoryHolidayCents: 0,
    otherDailyCents: 0,
    fixedExpensesCents: 0,
    totalCents: 0,
  };

  const educatorMap = new Map<
    string,
    { name: string; gross: number; days: Set<string> }
  >();

  const payrollMap = new Map<
    string,
    {
      name: string;
      hours: number;
      gross: number;
      cotisation: number;
      vacation: number;
      sick: number;
      vacationPct: 4 | 6;
    }
  >();

  let enrollmentInfantCents = 0;
  let enrollmentOver18Cents = 0;
  let enrollmentLegacyCents = 0;
  const otherRevenueByLabel = new Map<string, number>();
  const journalExpenseItems: ReportLineItem[] = [];

  for (const j of journals) {
    const dayKey = j.journalDate.toISOString().slice(0, 10);
    for (const line of j.lines) {
      if (line.kind === "revenue") {
        switch (line.category) {
          case "revenue_enrollment_infant":
            enrollmentInfantCents += line.amountCents;
            revenue.enrollmentCents += line.amountCents;
            break;
          case "revenue_enrollment_over18":
            enrollmentOver18Cents += line.amountCents;
            revenue.enrollmentCents += line.amountCents;
            break;
          case "revenue_enrollment":
            enrollmentLegacyCents += line.amountCents;
            revenue.enrollmentCents += line.amountCents;
            break;
          case "revenue_sortie":
          case "revenue_photo":
          default: {
            revenue.otherCents += line.amountCents;
            const lbl = (line.label?.trim() || "Autre revenu").slice(0, 120);
            otherRevenueByLabel.set(
              lbl,
              (otherRevenueByLabel.get(lbl) ?? 0) + line.amountCents
            );
          }
        }
        revenue.totalCents += line.amountCents;
      } else {
        switch (line.category) {
          case "expense_educator_gross":
            expenses.educatorGrossCents += line.amountCents;
            if (line.educatorId) {
              const id = line.educatorId;
              const cur = educatorMap.get(id) ?? {
                name: line.educatorName ?? id,
                gross: 0,
                days: new Set<string>(),
              };
              cur.gross += line.amountCents;
              if (line.hoursWorked != null && line.hoursWorked > 0) {
                cur.days.add(dayKey);
              }
              educatorMap.set(id, cur);

              const pay = payrollMap.get(id) ?? {
                name: line.educatorName ?? id,
                hours: 0,
                gross: 0,
                cotisation: 0,
                vacation: 0,
                sick: 0,
                vacationPct: 4 as 4 | 6,
              };
              pay.gross += line.amountCents;
              if (line.hoursWorked != null && line.hoursWorked > 0) {
                pay.hours += line.hoursWorked;
              }
              payrollMap.set(id, pay);
            }
            break;
          case "expense_employer_cotisation":
            expenses.employerCotisationCents += line.amountCents;
            if (line.educatorId) {
              const pay = payrollMap.get(line.educatorId) ?? {
                name: line.educatorName ?? line.educatorId,
                hours: 0,
                gross: 0,
                cotisation: 0,
                vacation: 0,
                sick: 0,
                vacationPct: 4 as 4 | 6,
              };
              pay.cotisation += line.amountCents;
              payrollMap.set(line.educatorId, pay);
            }
            break;
          case "expense_vacation_indemnity":
            expenses.vacationIndemnityCents += line.amountCents;
            if (line.educatorId) {
              const pay = payrollMap.get(line.educatorId) ?? {
                name: line.educatorName ?? line.educatorId,
                hours: 0,
                gross: 0,
                cotisation: 0,
                vacation: 0,
                sick: 0,
                vacationPct: 4 as 4 | 6,
              };
              pay.vacation += line.amountCents;
              if (line.employerContributionPercent === 6) pay.vacationPct = 6;
              payrollMap.set(line.educatorId, pay);
            }
            break;
          case "expense_sick_leave_indemnity":
            expenses.sickLeaveIndemnityCents += line.amountCents;
            if (line.educatorId) {
              const pay = payrollMap.get(line.educatorId) ?? {
                name: line.educatorName ?? line.educatorId,
                hours: 0,
                gross: 0,
                cotisation: 0,
                vacation: 0,
                sick: 0,
                vacationPct: 4 as 4 | 6,
              };
              pay.sick += line.amountCents;
              payrollMap.set(line.educatorId, pay);
            }
            break;
          case "expense_other":
            expenses.otherDailyCents += line.amountCents;
            journalExpenseItems.push({
              label: line.label?.trim() || "Autre dépense",
              amountCents: line.amountCents,
              journalDate: dayKey,
            });
            break;
          default:
            expenses.otherDailyCents += line.amountCents;
        }
        expenses.totalCents += line.amountCents;
      }
    }
  }

  const educatorStats: EducatorPeriodPayStats[] = Array.from(
    educatorMap.entries()
  ).map(([educatorId, v]) => ({
    educatorId,
    educatorName: v.name,
    totalGrossCents: v.gross,
    daysWorked: v.days.size,
  }));

  const revenueLineItems: ReportLineItem[] = [];
  if (enrollmentInfantCents > 0) {
    revenueLineItems.push({
      label: "Inscriptions — poupon (6–18 mois)",
      amountCents: enrollmentInfantCents,
    });
  }
  if (enrollmentOver18Cents > 0) {
    revenueLineItems.push({
      label: "Inscriptions — 18 mois et plus",
      amountCents: enrollmentOver18Cents,
    });
  }
  if (enrollmentLegacyCents > 0) {
    revenueLineItems.push({
      label: "Inscriptions (tarif unique)",
      amountCents: enrollmentLegacyCents,
    });
  }
  for (const [label, amountCents] of Array.from(otherRevenueByLabel.entries()).sort(
    (a, b) => a[0].localeCompare(b[0], "fr")
  )) {
    revenueLineItems.push({ label, amountCents });
  }

  let holidayIndemnityLines: HolidayIndemnityLine[] = [];
  let holidayIndemnitiesByEducator: EducatorHolidayIndemnitySummary[] = [];

  if (holidaysInPeriod.length > 0) {
    let earliestRef = parseDateOnly(holidaysInPeriod[0]);
    let latestRef = parseDateOnly(holidaysInPeriod[0]);
    for (const h of holidaysInPeriod) {
      const w = referencePayWindowForHoliday(h);
      const rf = parseDateOnly(w.referenceFrom);
      const rt = parseDateOnly(w.referenceTo);
      if (rf < earliestRef) earliestRef = rf;
      if (rt > latestRef) latestRef = rt;
    }

    const lookbackJournals = await prisma.dailyJournal.findMany({
      where: { journalDate: { gte: earliestRef, lte: latestRef } },
      include: { lines: true },
    });

    const grossByEducatorDay = buildGrossByEducatorDay(lookbackJournals);
    const computed = computeStatutoryHolidayIndemnitiesFromJournals({
      holidayDatesInPeriod: holidaysInPeriod,
      grossByEducatorDay,
    });
    holidayIndemnityLines = computed.lines;
    holidayIndemnitiesByEducator = computed.byEducator;
    expenses.statutoryHolidayCents = computed.totalCents;
  }

  const fixedRows = await prisma.fixedExpenseEntry.findMany({
    where: {
      periodStart: { lte: to },
      periodEnd: { gte: from },
    },
    orderBy: { label: "asc" },
  });

  const fixedExpenses = fixedRows.map((f) => ({
    id: f.id,
    label: f.label,
    amountCents: f.amountCents,
    sourceName: f.sourceName ?? undefined,
    note: f.note ?? undefined,
  }));
  expenses.fixedExpensesCents = fixedExpenses.reduce((s, f) => s + f.amountCents, 0);

  expenses.totalCents += expenses.statutoryHolidayCents + expenses.fixedExpensesCents;
  const netCents = revenue.totalCents - expenses.totalCents;

  const holidayByEducator = new Map(
    holidayIndemnitiesByEducator.map((h) => [h.educatorId, h.totalIndemnityCents])
  );

  const educatorPayroll: EducatorPayrollDetail[] = Array.from(
    payrollMap.entries()
  )
    .map(([educatorId, p]) => ({
      educatorId,
      educatorName: p.name,
      totalHours: Math.round(p.hours * 100) / 100,
      totalGrossCents: p.gross,
      employerCotisationCents: p.cotisation,
      vacationIndemnityCents: p.vacation,
      sickLeaveIndemnityCents: p.sick,
      holidayIndemnityCents: holidayByEducator.get(educatorId) ?? 0,
      vacationIndemnityPercent: p.vacationPct,
    }))
    .sort((a, b) => a.educatorName.localeCompare(b.educatorName, "fr"));

  return {
    from: options.fromStr,
    to: options.toStr,
    statutoryHolidayDates: holidaysInPeriod,
    daysWithJournal: journals.length,
    revenue,
    expenses,
    netCents,
    educatorStats,
    educatorPayroll,
    revenueLineItems,
    journalExpenseItems,
    holidayIndemnityLines,
    holidayIndemnitiesByEducator,
    fixedExpenses,
  };
}
