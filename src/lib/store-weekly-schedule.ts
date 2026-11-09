import { prisma } from "./db";
import {
  healedKindForMisparseEntry,
  normalizeScheduleEntryKind,
} from "./heal-schedule-absence-travail";
import { matchPdfNameToEducator } from "./parse-presence-pdf";
import {
  matchScheduleToEducators,
  type MatchedScheduleEntry,
} from "./parse-employee-schedule-pdf";
import type { ScheduleEntryRow } from "./heal-schedule-absence-travail";
import { parseEmployeeSchedulePdfBuffer } from "./parse-employee-schedule-pdf-grid";
import {
  embedSchedulePdfInText,
  extractSchedulePdfBuffer,
  schedulePdfTextHint,
} from "./schedule-pdf-storage";

/** Incrémenter quand la logique d’interprétation du PDF horaire change. */
export const SCHEDULE_PARSER_VERSION = 22;

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

async function refreshScheduleFromStoredPdf(scheduleId: string): Promise<void> {
  const row = await prisma.employeeWeeklySchedule.findUnique({
    where: { id: scheduleId },
  });
  const pdfBuf = extractSchedulePdfBuffer({
    rawPdfBytes: row?.rawPdfBytes,
    rawPdfText: row?.rawPdfText,
  });
  if (!pdfBuf) return;

  const parsed = await parseEmployeeSchedulePdfBuffer(
    pdfBuf,
    schedulePdfTextHint(row?.rawPdfText)
  );
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
  const toFix = entries.filter(
    (e) => healedKindForMisparseEntry(e, entries) != null
  );
  if (toFix.length === 0) return;

  await prisma.$transaction(
    toFix.map((e) => {
      const kind = healedKindForMisparseEntry(e, entries)!;
      return prisma.employeeScheduleEntry.update({
        where: { id: e.id },
        data: {
          kind,
          expectedStart: null,
          expectedEnd: null,
        },
      });
    })
  );
}

async function ensureScheduleUpToDate(scheduleId: string): Promise<void> {
  try {
    const row = await prisma.employeeWeeklySchedule.findUnique({
      where: { id: scheduleId },
      select: { parserVersion: true, rawPdfBytes: true },
    });
    if (row && row.parserVersion < SCHEDULE_PARSER_VERSION) {
      await refreshScheduleFromStoredPdf(scheduleId);
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

/** Anciens imports : educatorId vide alors que le rapprochement nom fonctionne maintenant. */
async function backfillNullScheduleEducatorIds(scheduleId: string): Promise<void> {
  const nullRows = await prisma.employeeScheduleEntry.findMany({
    where: { scheduleId, educatorId: null },
    select: { id: true, pdfName: true },
  });
  if (nullRows.length === 0) return;

  const educators = await prisma.educator.findMany({
    select: { id: true, name: true },
  });

  const updates = nullRows
    .map((row) => {
      const hit = matchPdfNameToEducator(row.pdfName, educators);
      return hit ? { id: row.id, educatorId: hit.id } : null;
    })
    .filter((u): u is { id: string; educatorId: string } => u != null);

  await prisma.$transaction(
    updates.map((u) =>
      prisma.employeeScheduleEntry.update({
        where: { id: u.id },
        data: { educatorId: u.educatorId },
      })
    )
  );
}

export async function replaceWeeklySchedule(options: {
  periodStart: string;
  periodEnd: string;
  sourceFileName?: string;
  rawPdfText?: string;
  rawPdfBytes?: Buffer;
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
        rawPdfText:
          options.rawPdfBytes?.length && options.rawPdfText
            ? embedSchedulePdfInText(options.rawPdfText, options.rawPdfBytes)
            : options.rawPdfText?.trim() || null,
        rawPdfBytes: options.rawPdfBytes?.length ? options.rawPdfBytes : null,
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

function timeToMinHm(t: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? "").trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

async function matchedWeekFromStoredPdf(
  pdfBuf: Buffer,
  rawPdfText: string | null | undefined,
  educators: { id: string; name: string }[]
) {
  const parsed = await parseEmployeeSchedulePdfBuffer(
    pdfBuf,
    schedulePdfTextHint(rawPdfText)
  );
  if (!parsed) return null;
  return matchScheduleToEducators(parsed, educators);
}

function matchedEntriesToHealRows(
  entries: MatchedScheduleEntry[]
): ScheduleEntryRow[] {
  return entries.map((e, i) => ({
    id: `grid-${i}`,
    educatorId: e.educatorId,
    pdfName: e.pdfName,
    roleLabel: e.roleLabel ?? null,
    workDate: parseDateOnly(e.workDate),
    kind: e.kind,
    expectedStart: e.expectedStart ?? null,
    expectedEnd: e.expectedEnd ?? null,
  }));
}

function scheduleEntryPreferenceRank(kind: string): number {
  if (kind === "work") return 4;
  if (kind === "absence" || kind === "vacation") return 3;
  if (kind === "unknown") return 1;
  return 2;
}

/** Plusieurs lignes (ex. Mohamed Hosny + Mohamed Hosny Shaimaa) → garder la meilleure interprétation. */
function dedupeDayEntriesByEducator<
  T extends {
    educatorId: string | null;
    pdfName: string;
    kind: string;
    expectedStart: string | null;
    expectedEnd: string | null;
  },
>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const e of rows) {
    const key = e.educatorId?.trim() || e.pdfName.trim();
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, e);
      continue;
    }
    const rNew = scheduleEntryPreferenceRank(e.kind);
    const rOld = scheduleEntryPreferenceRank(prev.kind);
    if (rNew > rOld) {
      byKey.set(key, e);
      continue;
    }
    if (rNew < rOld) continue;
    const newHasTimes = Boolean(
      (e.expectedStart ?? "").trim() && (e.expectedEnd ?? "").trim()
    );
    const oldHasTimes = Boolean(
      (prev.expectedStart ?? "").trim() && (prev.expectedEnd ?? "").trim()
    );
    if (newHasTimes && !oldHasTimes) {
      byKey.set(key, e);
      continue;
    }
    if (newHasTimes && oldHasTimes) {
      if (timeToMinHm(e.expectedEnd) > timeToMinHm(prev.expectedEnd)) {
        byKey.set(key, e);
      }
    }
  }
  return Array.from(byKey.values());
}

function mapMatchedEntryToDayRow(
  e: MatchedScheduleEntry,
  weekHealRows: ScheduleEntryRow[],
  nameById: Map<string, string>
): ScheduleEntryForDay {
  const healRow: ScheduleEntryRow = {
    id: `${e.educatorId}-${e.workDate}`,
    educatorId: e.educatorId,
    pdfName: e.pdfName,
    roleLabel: e.roleLabel ?? null,
    workDate: parseDateOnly(e.workDate),
    kind: e.kind,
    expectedStart: e.expectedStart ?? null,
    expectedEnd: e.expectedEnd ?? null,
  };
  const kind = normalizeScheduleEntryKind(healRow, weekHealRows);
  const hasTimeRange = Boolean(e.expectedStart?.trim() && e.expectedEnd?.trim());
  const exposeTimes =
    kind === "work" || (kind === "unknown" && hasTimeRange);

  return {
    educatorId: e.educatorId,
    educatorName: nameById.get(e.educatorId) ?? e.educatorName,
    pdfName: e.pdfName,
    roleLabel: e.roleLabel,
    kind,
    expectedStart: exposeTimes ? e.expectedStart : undefined,
    expectedEnd: exposeTimes ? e.expectedEnd : undefined,
  };
}

export async function getScheduleContextForDate(dateStr: string): Promise<{
  schedule: WeeklyScheduleSummary | null;
  entries: ScheduleEntryForDay[];
  needsPdfReupload?: boolean;
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
  await backfillNullScheduleEducatorIds(scheduleRow.id);

  const educators = await prisma.educator.findMany({
    select: { id: true, name: true },
  });
  const nameById = new Map(educators.map((e) => [e.id, e.name]));
  const eduList = educators.map((e) => ({ id: e.id, name: e.name }));

  const scheduleSummary: WeeklyScheduleSummary = {
    id: scheduleRow.id,
    periodStart: dateToIso(scheduleRow.periodStart),
    periodEnd: dateToIso(scheduleRow.periodEnd),
    sourceFileName: scheduleRow.sourceFileName ?? undefined,
    uploadedByName: scheduleRow.uploadedByName,
    createdAt: scheduleRow.createdAt.toISOString(),
    entryCount: scheduleRow._count.entries,
  };

  let pdfRow: { rawPdfBytes: Uint8Array | null; rawPdfText: string | null } | null =
    null;
  try {
    pdfRow = await prisma.employeeWeeklySchedule.findUnique({
      where: { id: scheduleRow.id },
      select: { rawPdfBytes: true, rawPdfText: true },
    });
  } catch {
    pdfRow = await prisma.employeeWeeklySchedule.findUnique({
      where: { id: scheduleRow.id },
      select: { rawPdfText: true },
    }).then((r) => (r ? { rawPdfBytes: null, rawPdfText: r.rawPdfText } : null));
  }

  const pdfBuf = pdfRow
    ? extractSchedulePdfBuffer({
        rawPdfBytes: pdfRow.rawPdfBytes,
        rawPdfText: pdfRow.rawPdfText,
      })
    : null;

  if (pdfBuf) {
    const matched = await matchedWeekFromStoredPdf(
      pdfBuf,
      pdfRow?.rawPdfText ?? null,
      eduList
    );
    if (matched) {
      const weekHealRows = matchedEntriesToHealRows(matched.entries);
      const dayMatched = matched.entries.filter((e) => e.workDate === dateStr);
      const bestByEducator = new Map<string, MatchedScheduleEntry>();
      for (const e of dayMatched) {
        const id = e.educatorId;
        const cur = bestByEducator.get(id);
        if (!cur) {
          bestByEducator.set(id, e);
          continue;
        }
        const rNew = scheduleEntryPreferenceRank(e.kind);
        const rOld = scheduleEntryPreferenceRank(cur.kind);
        if (rNew > rOld) {
          bestByEducator.set(id, e);
          continue;
        }
        if (rNew === rOld && timeToMinHm(e.expectedEnd) > timeToMinHm(cur.expectedEnd)) {
          bestByEducator.set(id, e);
        }
      }
      const entries = Array.from(bestByEducator.values())
        .map((e) => mapMatchedEntryToDayRow(e, weekHealRows, nameById))
        .sort((a, b) => (a.pdfName ?? "").localeCompare(b.pdfName ?? ""));
      return { schedule: scheduleSummary, entries };
    }
  }

  const weekEntries = await prisma.employeeScheduleEntry.findMany({
    where: { scheduleId: scheduleRow.id },
  });

  const dayEntries = weekEntries.filter(
    (e) => dateToIso(e.workDate) === dateStr
  );
  dayEntries.sort((a, b) => a.pdfName.localeCompare(b.pdfName));

  const dayEntriesWithResolved = dayEntries.map((e) => {
    const resolvedId =
      e.educatorId ??
      matchPdfNameToEducator(e.pdfName, educators)?.id ??
      null;
    return { row: e, resolvedEducatorId: resolvedId };
  });

  const dedupedRows = dedupeDayEntriesByEducator(
    dayEntriesWithResolved.map(({ row, resolvedEducatorId }) => ({
      ...row,
      educatorId: resolvedEducatorId,
    }))
  );
  dedupedRows.sort((a, b) => a.pdfName.localeCompare(b.pdfName));

  return {
    schedule: scheduleSummary,
    needsPdfReupload: !pdfBuf,
    entries: dedupedRows.map((e) => {
      const kind = normalizeScheduleEntryKind(e, weekEntries);
      const resolved =
        e.educatorId != null
          ? {
              id: e.educatorId,
              name: nameById.get(e.educatorId) ?? e.pdfName,
            }
          : matchPdfNameToEducator(e.pdfName, educators);
      const hasTimeRange = Boolean(
        (e.expectedStart ?? "").trim() && (e.expectedEnd ?? "").trim()
      );
      /** « unknown » peut quand même avoir une plage horaire extraite du PDF. */
      const exposeTimes = kind === "work" || (kind === "unknown" && hasTimeRange);

      return {
        educatorId: resolved?.id,
        educatorName: resolved?.name,
        pdfName: e.pdfName,
        roleLabel: e.roleLabel ?? undefined,
        kind,
        expectedStart: exposeTimes ? e.expectedStart ?? undefined : undefined,
        expectedEnd: exposeTimes ? e.expectedEnd ?? undefined : undefined,
      };
    }),
  };
}
