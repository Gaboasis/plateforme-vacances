/** Corrige les jours « AbsenceTravail » importés avant le fix parseur v2. */

export type ScheduleEntryRow = {
  id: string;
  educatorId: string | null;
  pdfName: string;
  workDate: Date;
  kind: string;
  expectedStart: string | null;
  expectedEnd: string | null;
};

function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekdayDatesInSchedule(
  entries: ScheduleEntryRow[]
): string[] {
  return Array.from(
    new Set(entries.map((e) => dateToIso(e.workDate)))
  ).sort();
}

function isSamihaEntry(e: ScheduleEntryRow): boolean {
  return (
    e.educatorId === "samiha" ||
    /jaouadi|samiha/i.test(e.pdfName)
  );
}

function isKhiraEntry(e: ScheduleEntryRow): boolean {
  return (
    e.educatorId === "7" ||
    /hemiss|om el khir|khir/i.test(e.pdfName)
  );
}

/** Affichage / comparaison sans accès à toute la semaine en base. */
export function isAbsenceTravailMisparseEntry(
  entry: ScheduleEntryRow,
  weekEntries: ScheduleEntryRow[]
): boolean {
  if (entry.kind !== "work") return false;

  if (
    isSamihaEntry(entry) &&
    entry.expectedStart === "09:00" &&
    entry.expectedEnd === "17:30"
  ) {
    return true;
  }

  if (
    isKhiraEntry(entry) &&
    entry.expectedStart === "09:00" &&
    entry.expectedEnd === "17:00"
  ) {
    const weekDates = weekdayDatesInSchedule(weekEntries);
    const fourthDay = weekDates[3];
    if (!fourthDay || dateToIso(entry.workDate) !== fourthDay) return false;

    const khiraWork917 = weekEntries.filter(
      (e) =>
        isKhiraEntry(e) &&
        e.kind === "work" &&
        e.expectedStart === "09:00" &&
        e.expectedEnd === "17:00"
    );
    return khiraWork917.length >= 4;
  }

  return false;
}

export function entryIdsToHealAbsenceTravailMisparse(
  entries: ScheduleEntryRow[]
): string[] {
  const fixIds: string[] = [];
  for (const e of entries) {
    if (isAbsenceTravailMisparseEntry(e, entries)) {
      fixIds.push(e.id);
    }
  }
  return Array.from(new Set(fixIds));
}

export function normalizeScheduleEntryKind(
  entry: ScheduleEntryRow,
  weekEntries: ScheduleEntryRow[]
): string {
  if (isAbsenceTravailMisparseEntry(entry, weekEntries)) {
    return "absence";
  }
  return entry.kind;
}
