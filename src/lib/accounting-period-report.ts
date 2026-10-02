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

  for (const j of journals) {
    const dayKey = j.journalDate.toISOString().slice(0, 10);
    for (const line of j.lines) {
      if (line.kind === "revenue") {
        switch (line.category) {
          case "revenue_enrollment":
          case "revenue_enrollment_infant":
          case "revenue_enrollment_over18":
            revenue.enrollmentCents += line.amountCents;
            break;
          case "revenue_sortie":
          case "revenue_photo":
          default:
            revenue.otherCents += line.amountCents;
        }
        revenue.totalCents += line.amountCents;
      } else {
        switch (line.category) {
          case "expense_educator_gross":
            expenses.educatorGrossCents += line.amountCents;
            if (line.educatorId) {
              const cur = educatorMap.get(line.educatorId) ?? {
                name: line.educatorName ?? line.educatorId,
                gross: 0,
                days: new Set<string>(),
              };
              cur.gross += line.amountCents;
              if (line.hoursWorked != null && line.hoursWorked > 0) {
                cur.days.add(dayKey);
              }
              educatorMap.set(line.educatorId, cur);
            }
            break;
          case "expense_employer_cotisation":
            expenses.employerCotisationCents += line.amountCents;
            break;
          case "expense_vacation_indemnity":
            expenses.vacationIndemnityCents += line.amountCents;
            break;
          case "expense_sick_leave_indemnity":
            expenses.sickLeaveIndemnityCents += line.amountCents;
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

  return {
    from: options.fromStr,
    to: options.toStr,
    statutoryHolidayDates: holidaysInPeriod,
    daysWithJournal: journals.length,
    revenue,
    expenses,
    netCents,
    educatorStats,
    holidayIndemnityLines,
    holidayIndemnitiesByEducator,
    fixedExpenses,
  };
}
