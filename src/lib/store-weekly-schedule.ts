import { prisma } from "./db";
import {
  entryIdsToHealAbsenceTravailMisparse,
  normalizeScheduleEntryKind,
} from "./heal-schedule-absence-travail";
import {
  matchScheduleToEducators,
  parseEmployeeSchedulePdfText,
  type MatchedScheduleEntry,
} from "./parse-employee-schedule-pdf";

/** Incrémenter quand la logique d’interprétation du PDF horaire change. */
export const SCHEDULE_PARSER_VERSION = 2;

function parseDateOnly(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error("Date invalide.");
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
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

async function refreshScheduleFromRawText(scheduleId: string): Promise<void> {
  const row = await prisma.employeeWeeklySchedule.findUnique({
    where: { id: scheduleId },
  });
  if (!row?.rawPdfText?.trim()) return;

  const parsed = parseEmployeeSchedulePdfText(row.rawPdfText);
  if (!parsed) return;

  const educators = await prisma.educator.findMany({
    select: { id: true, name: true },
  });
  const matched = matchScheduleToEducators(
    parsed,
    educators.map((e) => ({ id: e.id, name: e.name }))
  );

  await prisma.$transaction(async (tx) => {
    await tx.employeeScheduleEntry.deleteMany({ where: { scheduleId } });
    if (matched.entries.length > 0) {
      await tx.employeeScheduleEntry.createMany({
        data: matched.entries.map((e) => ({
          scheduleId,
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
    await tx.employeeWeeklySchedule.update({
      where: { id: scheduleId },
      data: { parserVersion: SCHEDULE_PARSER_VERSION },
    });
  });
}

async function persistAbsenceTravailHeal(scheduleId: string): Promise<void> {
  const entries = await prisma.employeeScheduleEntry.findMany({
    where: { scheduleId },
  });
  const fixIds = entryIdsToHealAbsenceTravailMisparse(entries);
  if (fixIds.length === 0) return;

  await prisma.employeeScheduleEntry.updateMany({
    where: { id: { in: fixIds } },
    data: {
      kind: "absence",
      expectedStart: null,
      expectedEnd: null,
    },
  });
}

async function ensureScheduleUpToDate(scheduleId: string): Promise<void> {
  try {
    const row = await prisma.employeeWeeklySchedule.findUnique({
      where: { id: scheduleId },
      select: { parserVersion: true, rawPdfText: true },
    });
    if (
      row &&
      row.parserVersion < SCHEDULE_PARSER_VERSION &&
      row.rawPdfText?.trim()
    ) {
      await refreshScheduleFromRawText(scheduleId);
    }
  } catch {
    /* colonnes schema absentes avant db push */
  }

  try {
    await persistAbsenceTravailHeal(scheduleId);
  } catch {
    /* correction en base indisponible */
  }
}

export async function replaceWeeklySchedule(options: {
  periodStart: string;
  periodEnd: string;
  sourceFileName?: string;
  rawPdfText?: string;
  uploadedById: string;
  uploadedByName: string;
  entries: MatchedScheduleEntry[];
}): Promise<WeeklyScheduleSummary> {
  const periodStart = parseDateOnly(options.periodStart);
  const periodEnd = parseDateOnly(options.periodEnd);

  const result = await prisma.$transaction(async (tx) => {
    const overlapping = await tx.employeeWeeklySchedule.findMany({
      where: {
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      select: { id: true },
    });
    if (overlapping.length > 0) {
      await tx.employeeWeeklySchedule.deleteMany({
        where: { id: { in: overlapping.map((o) => o.id) } },
      });
    }

    const schedule = await tx.employeeWeeklySchedule.create({
      data: {
        periodStart,
        periodEnd,
        sourceFileName: options.sourceFileName?.trim() || null,
        rawPdfText: options.rawPdfText?.trim() || null,
        parserVersion: SCHEDULE_PARSER_VERSION,
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

export async function deleteWeeklySchedule(scheduleId: string): Promise<boolean> {
  const existing = await prisma.employeeWeeklySchedule.findUnique({
    where: { id: scheduleId },
    select: { id: true },
  });
  if (!existing) return false;
  await prisma.employeeWeeklySchedule.delete({ where: { id: scheduleId } });
  return true;
}

export async function listWeeklySchedules(limit = 12): Promise<WeeklyScheduleSummary[]> {
  const rows = await prisma.employeeWeeklySchedule.findMany({
    orderBy: { periodStart: "desc" },
    take: limit,
    include: { _count: { select: { entries: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    periodStart: dateToIso(r.periodStart),
    periodEnd: dateToIso(r.periodEnd),
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
      _count: { select: { entries: true } },
    },
  });

  if (!scheduleRow) {
    return { schedule: null, entries: [] };
  }

  await ensureScheduleUpToDate(scheduleRow.id);

  const weekEntries = await prisma.employeeScheduleEntry.findMany({
    where: { scheduleId: scheduleRow.id },
  });

  const dayEntries = weekEntries.filter(
    (e) => dateToIso(e.workDate) === dateStr
  );
  dayEntries.sort((a, b) => a.pdfName.localeCompare(b.pdfName));

  const educators = await prisma.educator.findMany({
    where: {
      id: {
        in: dayEntries
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
      periodStart: dateToIso(scheduleRow.periodStart),
      periodEnd: dateToIso(scheduleRow.periodEnd),
      sourceFileName: scheduleRow.sourceFileName ?? undefined,
      uploadedByName: scheduleRow.uploadedByName,
      createdAt: scheduleRow.createdAt.toISOString(),
      entryCount: scheduleRow._count.entries,
    },
    entries: dayEntries.map((e) => {
      const kind = normalizeScheduleEntryKind(e, weekEntries);
      return {
        educatorId: e.educatorId ?? undefined,
        educatorName: e.educatorId
          ? nameById.get(e.educatorId) ?? undefined
          : undefined,
        pdfName: e.pdfName,
        roleLabel: e.roleLabel ?? undefined,
        kind,
        expectedStart:
          kind === "absence" ? undefined : e.expectedStart ?? undefined,
        expectedEnd:
          kind === "absence" ? undefined : e.expectedEnd ?? undefined,
      };
    }),
  };
}
