import {
  DEFAULT_DAILY_INFANT_RATE_CENTS,
  DEFAULT_DAILY_OVER18_RATE_CENTS,
} from "./default-enrollment-rates";
import {
  buildEducatorPayrollJournalLines,
  isPayrollJournalCategory,
} from "./journal-educator-payroll-lines";
import { payableHoursFromGrossClock } from "./payroll-work-hours";
import { prisma } from "./db";
import type {
  AccountingConfig,
  DailyJournal,
  EducatorPaySummary,
  FixedExpenseEntry,
  JournalLine,
  JournalLineCategory,
} from "@/types";
import {
  isValidMonthKey,
  monthBounds,
  sortMonthKeys,
  splitAmountByCoverageDays,
  splitAmountCents,
} from "./fixed-expense-split";
import { randomUUID } from "crypto";

function lineToType(row: {
  id: string;
  kind: string;
  category: string;
  label: string | null;
  amountCents: number;
  educatorId: string | null;
  educatorName: string | null;
  hoursWorked: number | null;
  hourlyRateCents: number | null;
  employerContributionPercent: number | null;
  childCount: number | null;
  dailyRateCents: number | null;
  sortOrder: number;
  invoiceDate: Date | null;
  accountingPeriodStart: Date | null;
  accountingPeriodEnd: Date | null;
  splitGroupId: string | null;
  sourceName: string | null;
  note: string | null;
}): JournalLine {
  return {
    id: row.id,
    kind: row.kind as "expense" | "revenue",
    category: row.category as JournalLineCategory,
    label: row.label ?? undefined,
    amountCents: row.amountCents,
    educatorId: row.educatorId ?? undefined,
    educatorName: row.educatorName ?? undefined,
    hoursWorked: row.hoursWorked ?? undefined,
    hourlyRateCents: row.hourlyRateCents ?? undefined,
    employerContributionPercent: row.employerContributionPercent ?? undefined,
    childCount: row.childCount ?? undefined,
    dailyRateCents: row.dailyRateCents ?? undefined,
    sortOrder: row.sortOrder,
    invoiceDate: row.invoiceDate?.toISOString().slice(0, 10),
    accountingPeriodStart: row.accountingPeriodStart?.toISOString().slice(0, 10),
    accountingPeriodEnd: row.accountingPeriodEnd?.toISOString().slice(0, 10),
    splitGroupId: row.splitGroupId ?? undefined,
    sourceName: row.sourceName ?? undefined,
    note: row.note ?? undefined,
  };
}

function journalToType(row: {
  id: string;
  journalDate: Date;
  notes: string | null;
  updatedById: string;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
  lines: Parameters<typeof lineToType>[0][];
}): DailyJournal {
  return {
    id: row.id,
    journalDate: row.journalDate.toISOString().slice(0, 10),
    notes: row.notes ?? undefined,
    updatedById: row.updatedById,
    updatedByName: row.updatedByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines
      .map(lineToType)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  };
}

function parseJournalDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error("Date invalide (format AAAA-MM-JJ).");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) throw new Error("Date invalide.");
  return d;
}

function configFromRow(row: {
  dailyChildRateCents: number;
  dailyInfantRateCents: number;
  dailyOver18RateCents: number;
  employerContributionMethod: string;
  defaultEmployerContributionPercent: number;
  qcRrqEmployerPercent: number;
  qcAeEmployerPercent: number;
  qcRqapEmployerPercent: number;
  qcFssEmployerPercent: number;
  qcCnesstEmployerPercent: number;
  sickLeaveIndemnityPercent: number;
  updatedAt: Date;
}): AccountingConfig {
  const method =
    row.employerContributionMethod === "flat_percent"
      ? "flat_percent"
      : "quebec_statutory";
  return {
    dailyChildRateCents: row.dailyChildRateCents,
    dailyInfantRateCents: row.dailyInfantRateCents,
    dailyOver18RateCents: row.dailyOver18RateCents,
    employerContributionMethod: method,
    defaultEmployerContributionPercent: row.defaultEmployerContributionPercent,
    qcRrqEmployerPercent: row.qcRrqEmployerPercent,
    qcAeEmployerPercent: row.qcAeEmployerPercent,
    qcRqapEmployerPercent: row.qcRqapEmployerPercent,
    qcFssEmployerPercent: row.qcFssEmployerPercent,
    qcCnesstEmployerPercent: row.qcCnesstEmployerPercent,
    sickLeaveIndemnityPercent: row.sickLeaveIndemnityPercent,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureAccountingConfig(): Promise<AccountingConfig> {
  const row = await prisma.accountingConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      dailyChildRateCents: DEFAULT_DAILY_OVER18_RATE_CENTS,
      dailyInfantRateCents: DEFAULT_DAILY_INFANT_RATE_CENTS,
      dailyOver18RateCents: DEFAULT_DAILY_OVER18_RATE_CENTS,
      employerContributionMethod: "quebec_statutory",
      defaultEmployerContributionPercent: 18,
      qcRrqEmployerPercent: 6.3,
      qcAeEmployerPercent: 1.82,
      qcRqapEmployerPercent: 0.602,
      qcFssEmployerPercent: 1.65,
      qcCnesstEmployerPercent: 1.15,
      sickLeaveIndemnityPercent: 0.8,
    },
    update: {},
  });
  return configFromRow(row);
}

export async function setAccountingConfig(
  updates: Partial<AccountingConfig>
): Promise<AccountingConfig> {
  await ensureAccountingConfig();
  const data: Record<string, unknown> = {};
  if (updates.dailyChildRateCents != null) {
    data.dailyChildRateCents = Math.max(0, Math.round(updates.dailyChildRateCents));
  }
  if (updates.dailyInfantRateCents != null) {
    data.dailyInfantRateCents = Math.max(
      0,
      Math.round(updates.dailyInfantRateCents)
    );
  }
  if (updates.dailyOver18RateCents != null) {
    data.dailyOver18RateCents = Math.max(
      0,
      Math.round(updates.dailyOver18RateCents)
    );
  }
  if (updates.defaultEmployerContributionPercent != null) {
    data.defaultEmployerContributionPercent = Math.max(
      0,
      updates.defaultEmployerContributionPercent
    );
  }
  if (updates.employerContributionMethod != null) {
    data.employerContributionMethod =
      updates.employerContributionMethod === "flat_percent"
        ? "flat_percent"
        : "quebec_statutory";
  }
  const qcFields = [
    ["qcRrqEmployerPercent", updates.qcRrqEmployerPercent],
    ["qcAeEmployerPercent", updates.qcAeEmployerPercent],
    ["qcRqapEmployerPercent", updates.qcRqapEmployerPercent],
    ["qcFssEmployerPercent", updates.qcFssEmployerPercent],
    ["qcCnesstEmployerPercent", updates.qcCnesstEmployerPercent],
  ] as const;
  for (const [key, val] of qcFields) {
    if (val != null && Number.isFinite(val)) {
      data[key] = Math.max(0, val);
    }
  }
  if (updates.sickLeaveIndemnityPercent != null) {
    data.sickLeaveIndemnityPercent = Math.max(
      0,
      updates.sickLeaveIndemnityPercent
    );
  }
  const row = await prisma.accountingConfig.update({
    where: { id: "default" },
    data,
  });
  return configFromRow(row);
}

export async function getEducatorPaySummaries(): Promise<EducatorPaySummary[]> {
  const config = await ensureAccountingConfig();
  const list = await prisma.educator.findMany({
    where: {
      role: { in: ["educatrice", "cuisiniere", "entretien", "secretaire"] },
    },
    orderBy: [{ seniorityRank: "asc" }, { name: "asc" }],
  });
  return list.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role as EducatorPaySummary["role"],
    hourlyRateCents: e.hourlyRateCents ?? undefined,
    employerContributionPercent:
      e.employerContributionPercent ?? config.defaultEmployerContributionPercent,
    vacationIndemnityPercent: e.vacationIndemnityPercent === 6 ? 6 : 4,
  }));
}

function fixedExpenseRowToType(row: {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  label: string;
  amountCents: number;
  sourceName: string | null;
  note: string | null;
  invoiceDate: Date | null;
  splitGroupId: string | null;
}): FixedExpenseEntry {
  return {
    id: row.id,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    label: row.label,
    amountCents: row.amountCents,
    sourceName: row.sourceName ?? undefined,
    note: row.note ?? undefined,
    invoiceDate: row.invoiceDate?.toISOString().slice(0, 10),
    splitGroupId: row.splitGroupId ?? undefined,
  };
}

export async function listFixedExpensesForPeriod(
  fromStr: string,
  toStr: string
): Promise<FixedExpenseEntry[]> {
  const from = parseJournalDate(fromStr);
  const to = parseJournalDate(toStr);
  const rows = await prisma.fixedExpenseEntry.findMany({
    where: { periodStart: { lte: to }, periodEnd: { gte: from } },
    orderBy: [{ label: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(fixedExpenseRowToType);
}

/** Dépenses saisies à une date de journal (facture du jour), y compris réparties sur d'autres mois. */
export async function listFixedExpensesForJournalDay(
  journalDateStr: string
): Promise<FixedExpenseEntry[]> {
  const d = parseJournalDate(journalDateStr);
  const rows = await prisma.fixedExpenseEntry.findMany({
    where: {
      OR: [
        { invoiceDate: d },
        {
          AND: [{ periodStart: d }, { periodEnd: d }, { invoiceDate: null }],
        },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { label: "asc" }],
  });
  return rows.map(fixedExpenseRowToType);
}

export async function createFixedExpenseEntry(data: {
  periodStart: string;
  periodEnd: string;
  label: string;
  amountCents: number;
  sourceName?: string;
  note?: string;
  invoiceDate?: string;
  splitGroupId?: string;
}) {
  const row = await prisma.fixedExpenseEntry.create({
    data: {
      periodStart: parseJournalDate(data.periodStart),
      periodEnd: parseJournalDate(data.periodEnd),
      label: data.label.trim(),
      amountCents: Math.max(0, Math.round(data.amountCents)),
      sourceName: data.sourceName?.trim() || null,
      note: data.note?.trim() || null,
      invoiceDate: data.invoiceDate
        ? parseJournalDate(data.invoiceDate)
        : null,
      splitGroupId: data.splitGroupId?.trim() || null,
    },
  });
  return fixedExpenseRowToType(row);
}

export async function createFixedExpenseWithMonthSplit(data: {
  invoiceDate: string;
  label: string;
  amountCents: number;
  sourceName?: string;
  note?: string;
  allocateToMonths: string[];
}): Promise<FixedExpenseEntry[]> {
  const months = sortMonthKeys(
    Array.from(new Set(data.allocateToMonths.filter(isValidMonthKey)))
  );
  if (months.length === 0) {
    throw new Error("Choisissez au moins un mois.");
  }
  const total = Math.max(0, Math.round(data.amountCents));
  if (total <= 0) throw new Error("Montant invalide.");

  if (months.length === 1) {
    const bounds = monthBounds(months[0]!);
    const single = await createFixedExpenseEntry({
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      label: data.label,
      amountCents: total,
      sourceName: data.sourceName,
      note: data.note,
      invoiceDate: data.invoiceDate,
    });
    return [single];
  }

  const splitGroupId = randomUUID();
  const parts = splitAmountCents(total, months.length);
  const created: FixedExpenseEntry[] = [];

  for (let i = 0; i < months.length; i++) {
    const bounds = monthBounds(months[i]!);
    const partNote = [
      data.note?.trim(),
      `Tranche ${i + 1}/${months.length} — période comptable`,
    ]
      .filter(Boolean)
      .join(" · ");
    const row = await createFixedExpenseEntry({
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      label: data.label,
      amountCents: parts[i]!,
      sourceName: data.sourceName,
      note: partNote || undefined,
      invoiceDate: data.invoiceDate,
      splitGroupId,
    });
    created.push(row);
  }
  return created;
}

export async function createFixedExpenseWithCoverageSplit(data: {
  invoiceDate: string;
  label: string;
  amountCents: number;
  sourceName?: string;
  note?: string;
  coverageStart: string;
  coverageEnd: string;
}): Promise<FixedExpenseEntry[]> {
  const segments = splitAmountByCoverageDays(
    data.amountCents,
    data.coverageStart,
    data.coverageEnd
  );
  if (segments.length === 0) throw new Error("Période de couverture invalide.");

  const total = Math.max(0, Math.round(data.amountCents));
  if (total <= 0) throw new Error("Montant invalide.");

  if (segments.length === 1) {
    const s = segments[0]!;
    const single = await createFixedExpenseEntry({
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      label: data.label,
      amountCents: s.amountCents,
      sourceName: data.sourceName,
      note: data.note,
      invoiceDate: data.invoiceDate,
    });
    return [single];
  }

  const splitGroupId = randomUUID();
  const created: FixedExpenseEntry[] = [];

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const partNote = [
      data.note?.trim(),
      `Tranche ${i + 1}/${segments.length} — ${s.sharePercent} % (${s.dayCount} j)`,
    ]
      .filter(Boolean)
      .join(" · ");
    const row = await createFixedExpenseEntry({
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      label: data.label,
      amountCents: s.amountCents,
      sourceName: data.sourceName,
      note: partNote || undefined,
      invoiceDate: data.invoiceDate,
      splitGroupId,
    });
    created.push(row);
  }
  return created;
}

export async function deleteFixedExpenseEntry(id: string) {
  const existing = await prisma.fixedExpenseEntry.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.splitGroupId) {
    await prisma.fixedExpenseEntry.deleteMany({
      where: { splitGroupId: existing.splitGroupId },
    });
    return;
  }
  await prisma.fixedExpenseEntry.delete({ where: { id } });
}

export async function getDailyJournal(dateStr: string): Promise<DailyJournal | null> {
  const journalDate = parseJournalDate(dateStr);
  const row = await prisma.dailyJournal.findUnique({
    where: { journalDate },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return null;
  return journalToType(row);
}

export type JournalLineInput = Omit<JournalLine, "id"> & { id?: string };

export async function saveDailyJournal(options: {
  dateStr: string;
  notes?: string;
  lines: JournalLineInput[];
  actorId: string;
  actorName: string;
}): Promise<DailyJournal> {
  const journalDate = parseJournalDate(options.dateStr);
  const sanitized = options.lines
    .map((line, index) => ({
      kind: line.kind,
      category: line.category,
      label: line.label?.trim() || null,
      amountCents: Math.max(0, Math.round(line.amountCents)),
      educatorId: line.educatorId?.trim() || null,
      educatorName: line.educatorName?.trim() || null,
      hoursWorked: line.hoursWorked ?? null,
      hourlyRateCents: line.hourlyRateCents ?? null,
      employerContributionPercent: line.employerContributionPercent ?? null,
      childCount: line.childCount ?? null,
      dailyRateCents: line.dailyRateCents ?? null,
      sortOrder: line.sortOrder ?? index,
      invoiceDate: line.invoiceDate
        ? parseJournalDate(line.invoiceDate)
        : null,
      accountingPeriodStart: line.accountingPeriodStart
        ? parseJournalDate(line.accountingPeriodStart)
        : null,
      accountingPeriodEnd: line.accountingPeriodEnd
        ? parseJournalDate(line.accountingPeriodEnd)
        : null,
      splitGroupId: line.splitGroupId?.trim() || null,
      sourceName: line.sourceName?.trim() || null,
      note: line.note?.trim() || null,
    }))
    .filter(
      (l) =>
        l.amountCents > 0 ||
        l.category === "revenue_enrollment" ||
        l.category === "revenue_enrollment_infant" ||
        l.category === "revenue_enrollment_over18"
    );

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.dailyJournal.findUnique({ where: { journalDate } });
    const journal = existing
      ? await tx.dailyJournal.update({
          where: { id: existing.id },
          data: {
            notes: options.notes?.trim() || null,
            updatedById: options.actorId,
            updatedByName: options.actorName,
          },
        })
      : await tx.dailyJournal.create({
          data: {
            journalDate,
            notes: options.notes?.trim() || null,
            updatedById: options.actorId,
            updatedByName: options.actorName,
          },
        });

    await tx.journalLine.deleteMany({ where: { journalId: journal.id } });
    if (sanitized.length > 0) {
      await tx.journalLine.createMany({
        data: sanitized.map((l) => ({ ...l, journalId: journal.id })),
      });
    }

    return tx.dailyJournal.findUniqueOrThrow({
      where: { id: journal.id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });

  return journalToType(result);
}

/** Supprime le journal du jour et les dépenses fixes enregistrées pour cette date. */
export async function deleteDailyJournalForDate(dateStr: string): Promise<boolean> {
  const journalDate = parseJournalDate(dateStr);
  const result = await prisma.$transaction(async (tx) => {
    await tx.fixedExpenseEntry.deleteMany({
      where: {
        OR: [
          { periodStart: journalDate, periodEnd: journalDate },
          { invoiceDate: journalDate },
        ],
      },
    });
    const deleted = await tx.dailyJournal.deleteMany({
      where: { journalDate },
    });
    return deleted.count;
  });
  return result > 0;
}

export async function listJournalSummariesForMonth(yearMonth: string): Promise<
  {
    journalDate: string;
    totalRevenueCents: number;
    totalExpenseCents: number;
    balanceCents: number;
  }[]
> {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!m) return [];
  const start = new Date(Date.UTC(+m[1], +m[2] - 1, 1));
  const end = new Date(Date.UTC(+m[1], +m[2], 0, 23, 59, 59, 999));

  const journals = await prisma.dailyJournal.findMany({
    where: { journalDate: { gte: start, lte: end } },
    include: { lines: true },
    orderBy: { journalDate: "asc" },
  });

  return journals.map((j) => {
    let totalRevenueCents = 0;
    let totalExpenseCents = 0;
    for (const line of j.lines) {
      if (line.kind === "revenue") totalRevenueCents += line.amountCents;
      else totalExpenseCents += line.amountCents;
    }
    return {
      journalDate: j.journalDate.toISOString().slice(0, 10),
      totalRevenueCents,
      totalExpenseCents,
      balanceCents: totalRevenueCents - totalExpenseCents,
    };
  });
}

/**
 * Une seule fois : heures journal = punch−1 h pause ; recalcule salaires/cotisations des journées existantes.
 */
export async function migrateExistingJournalsForUnpaidLunchBreak(): Promise<number> {
  const cfgRow = await prisma.accountingConfig.findUnique({
    where: { id: "default" },
  });
  if (!cfgRow || cfgRow.lunchBreakHoursMigratedAt) {
    return 0;
  }

  const config = configFromRow(cfgRow);
  const paySummaries = await getEducatorPaySummaries();
  const payById = new Map(paySummaries.map((e) => [e.id, e]));

  const journals = await prisma.dailyJournal.findMany({
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const journal of journals) {
      const grossLines = journal.lines.filter(
        (l) =>
          l.category === "expense_educator_gross" &&
          l.educatorId &&
          l.hoursWorked != null &&
          l.hoursWorked > 0
      );
      if (grossLines.length === 0) continue;

      const educatorIds = new Set(grossLines.map((g) => g.educatorId!));
      const kept = journal.lines.filter(
        (l) =>
          !l.educatorId ||
          !educatorIds.has(l.educatorId) ||
          !isPayrollJournalCategory(l.category)
      );

      const payrollDrafts: ReturnType<typeof buildEducatorPayrollJournalLines> =
        [];

      for (const gross of grossLines) {
        const eduId = gross.educatorId!;
        const edu = payById.get(eduId);
        if (!edu) continue;

        const oldHours = gross.hoursWorked!;
        const newHours = payableHoursFromGrossClock(oldHours);
        const rate = gross.hourlyRateCents ?? edu.hourlyRateCents ?? 0;
        payrollDrafts.push(
          ...buildEducatorPayrollJournalLines(
            {
              id: edu.id,
              name: edu.name,
              hourlyRateCents: rate,
              vacationIndemnityPercent: edu.vacationIndemnityPercent,
              employerContributionPercent: edu.employerContributionPercent,
            },
            newHours,
            config
          )
        );
      }

      if (payrollDrafts.length === 0) continue;

      await tx.journalLine.deleteMany({ where: { journalId: journal.id } });

      const sortBase = kept.length;
      const toCreate = [
        ...kept.map((l, index) => ({
          journalId: journal.id,
          kind: l.kind,
          category: l.category,
          label: l.label,
          amountCents: l.amountCents,
          educatorId: l.educatorId,
          educatorName: l.educatorName,
          hoursWorked: l.hoursWorked,
          hourlyRateCents: l.hourlyRateCents,
          employerContributionPercent: l.employerContributionPercent,
          childCount: l.childCount,
          dailyRateCents: l.dailyRateCents,
          sortOrder: l.sortOrder ?? index,
        })),
        ...payrollDrafts.map((l, i) => ({
          journalId: journal.id,
          kind: l.kind,
          category: l.category,
          label: l.label,
          amountCents: l.amountCents,
          educatorId: l.educatorId,
          educatorName: l.educatorName,
          hoursWorked: l.hoursWorked,
          hourlyRateCents: l.hourlyRateCents,
          employerContributionPercent: l.employerContributionPercent ?? null,
          childCount: null,
          dailyRateCents: null,
          sortOrder: sortBase + i,
        })),
      ];

      if (toCreate.length > 0) {
        await tx.journalLine.createMany({ data: toCreate });
      }
      updated += 1;
    }

    await tx.accountingConfig.update({
      where: { id: "default" },
      data: { lunchBreakHoursMigratedAt: new Date() },
    });
  });

  return updated;
}
