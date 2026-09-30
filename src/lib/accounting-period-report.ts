import { prisma } from "./db";
import {
  computeStatutoryHolidayIndemnities,
  totalHolidayIndemnityCents,
  type EducatorPeriodPayStats,
} from "./quebec-statutory-holiday";

function parseDateOnly(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error("Date invalide.");
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export type PeriodReport = {
  from: string;
  to: string;
  statutoryHolidayCount: number;
  daysWithJournal: number;
  revenue: {
    enrollmentCents: number;
    sortieCents: number;
    photoCents: number;
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
  holidayIndemnities: ReturnType<typeof computeStatutoryHolidayIndemnities>;
  fixedExpenses: {
    id: string;
    label: string;
    amountCents: number;
    sourceName?: string;
    note?: string;
  }[];
};

export async function buildPeriodReport(options: {
  fromStr: string;
  toStr: string;
  statutoryHolidayCount: number;
}): Promise<PeriodReport> {
  const from = parseDateOnly(options.fromStr);
  const to = parseDateOnly(options.toStr);
  if (from > to) throw new Error("La date de début doit précéder la fin.");

  const journals = await prisma.dailyJournal.findMany({
    where: { journalDate: { gte: from, lte: to } },
    include: { lines: true },
    orderBy: { journalDate: "asc" },
  });

  const revenue = {
    enrollmentCents: 0,
    sortieCents: 0,
    photoCents: 0,
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
            revenue.sortieCents += line.amountCents;
            break;
          case "revenue_photo":
            revenue.photoCents += line.amountCents;
            break;
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
  ).map(
    ([educatorId, v]) => ({
      educatorId,
      educatorName: v.name,
      totalGrossCents: v.gross,
      daysWorked: v.days.size,
    })
  );

  const holidayIndemnities = computeStatutoryHolidayIndemnities(
    educatorStats,
    options.statutoryHolidayCount
  );
  expenses.statutoryHolidayCents = totalHolidayIndemnityCents(holidayIndemnities);

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
    statutoryHolidayCount: Math.max(0, Math.floor(options.statutoryHolidayCount)),
    daysWithJournal: journals.length,
    revenue,
    expenses,
    netCents,
    educatorStats,
    holidayIndemnities,
    fixedExpenses,
  };
}
