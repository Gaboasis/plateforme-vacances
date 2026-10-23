import { prisma } from "./db";
import type { MatchedScheduleEntry } from "./parse-employee-schedule-pdf";

function parseDateOnly(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error("Date invalide.");
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

export type WeeklyScheduleSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  sourceFileName?: string;
  uploadedByName: string;
  createdAt: string;
  entryCount: number;
};

export type ScheduleEntryForDay = {
  educatorId?: string;
  educatorName?: string;
  pdfName: string;
  roleLabel?: string;
  kind: string;
  expectedStart?: string;
  expectedEnd?: string;
};

export async function replaceWeeklySchedule(options: {
  periodStart: string;
  periodEnd: string;
  sourceFileName?: string;
  uploadedById: string;
  uploadedByName: string;
  entries: MatchedScheduleEntry[];
}): Promise<WeeklyScheduleSummary> {
  const periodStart = parseDateOnly(options.periodStart);
  const periodEnd = parseDateOnly(options.periodEnd);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.employeeWeeklySchedule.findUnique({
      where: {
        periodStart_periodEnd: { periodStart, periodEnd },
      },
    });
    if (existing) {
      await tx.employeeScheduleEntry.deleteMany({
        where: { scheduleId: existing.id },
      });
      await tx.employeeWeeklySchedule.delete({ where: { id: existing.id } });
    }

    const schedule = await tx.employeeWeeklySchedule.create({
      data: {
        periodStart,
        periodEnd,
        sourceFileName: options.sourceFileName?.trim() || null,
        uploadedById: options.uploadedById,
        uploadedByName: options.uploadedByName,
      },
    });

    if (options.entries.length > 0) {
      await tx.employeeScheduleEntry.createMany({
        data: options.entries.map((e) => ({
          scheduleId: schedule.id,
          educatorId: e.educatorId,
          pdfName: e.pdfName,
          roleLabel: e.roleLabel,
          workDate: parseDateOnly(e.workDate),
          kind: e.kind,
          expectedStart: e.expectedStart ?? null,
          expectedEnd: e.expectedEnd ?? null,
        })),
      });
    }

    return schedule;
  });

  return {
    id: result.id,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    sourceFileName: options.sourceFileName,
    uploadedByName: options.uploadedByName,
    createdAt: result.createdAt.toISOString(),
    entryCount: options.entries.length,
  };
}

export async function listWeeklySchedules(limit = 12): Promise<WeeklyScheduleSummary[]> {
  const rows = await prisma.employeeWeeklySchedule.findMany({
    orderBy: { periodStart: "desc" },
    take: limit,
    include: { _count: { select: { entries: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    periodEnd: r.periodEnd.toISOString().slice(0, 10),
    sourceFileName: r.sourceFileName ?? undefined,
    uploadedByName: r.uploadedByName,
    createdAt: r.createdAt.toISOString(),
    entryCount: r._count.entries,
  }));
}

export async function getScheduleContextForDate(dateStr: string): Promise<{
  schedule: WeeklyScheduleSummary | null;
  entries: ScheduleEntryForDay[];
}> {
  const day = parseDateOnly(dateStr);
  const scheduleRow = await prisma.employeeWeeklySchedule.findFirst({
    where: {
      periodStart: { lte: day },
      periodEnd: { gte: day },
    },
    orderBy: { createdAt: "desc" },
    include: {
      entries: {
        where: { workDate: day },
        orderBy: { pdfName: "asc" },
      },
      _count: { select: { entries: true } },
    },
  });

  if (!scheduleRow) {
    return { schedule: null, entries: [] };
  }

  const educators = await prisma.educator.findMany({
    where: {
      id: {
        in: scheduleRow.entries
          .map((e) => e.educatorId)
          .filter((id): id is string => Boolean(id)),
      },
    },
    select: { id: true, name: true },
  });
  const nameById = new Map(educators.map((e) => [e.id, e.name]));

  return {
    schedule: {
      id: scheduleRow.id,
      periodStart: scheduleRow.periodStart.toISOString().slice(0, 10),
      periodEnd: scheduleRow.periodEnd.toISOString().slice(0, 10),
      sourceFileName: scheduleRow.sourceFileName ?? undefined,
      uploadedByName: scheduleRow.uploadedByName,
      createdAt: scheduleRow.createdAt.toISOString(),
      entryCount: scheduleRow._count.entries,
    },
    entries: scheduleRow.entries.map((e) => ({
      educatorId: e.educatorId ?? undefined,
      educatorName: e.educatorId
        ? nameById.get(e.educatorId) ?? undefined
        : undefined,
      pdfName: e.pdfName,
      roleLabel: e.roleLabel ?? undefined,
      kind: e.kind,
      expectedStart: e.expectedStart ?? undefined,
      expectedEnd: e.expectedEnd ?? undefined,
    })),
  };
}
