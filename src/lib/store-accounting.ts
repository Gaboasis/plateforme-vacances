import { prisma } from "./db";
import type {
  AccountingConfig,
  DailyJournal,
  EducatorPaySummary,
  JournalLine,
  JournalLineCategory,
} from "@/types";

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
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureAccountingConfig(): Promise<AccountingConfig> {
  const row = await prisma.accountingConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      dailyChildRateCents: 4500,
      dailyInfantRateCents: 5200,
      dailyOver18RateCents: 4500,
      employerContributionMethod: "quebec_statutory",
      defaultEmployerContributionPercent: 18,
      qcRrqEmployerPercent: 6.3,
      qcAeEmployerPercent: 1.82,
      qcRqapEmployerPercent: 0.602,
      qcFssEmployerPercent: 1.65,
      qcCnesstEmployerPercent: 1.15,
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
  }));
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
