/** Corrige en base les jours « AbsenceTravail » importés avant le fix parseur v2. */

type ScheduleEntryRow = {
  id: string;
  educatorId: string | null;
  pdfName: string;
  workDate: Date;
  kind: string;
  expectedStart: string | null;
  expectedEnd: string | null;
};

export function entryIdsToHealAbsenceTravailMisparse(
  entries: ScheduleEntryRow[]
): string[] {
  const byEducator = new Map<string, ScheduleEntryRow[]>();
  for (const e of entries) {
    const key = e.educatorId ?? e.pdfName;
    const list = byEducator.get(key) ?? [];
    list.push(e);
    byEducator.set(key, list);
  }

  const fixIds: string[] = [];

  for (const list of Array.from(byEducator.values())) {
    const usualSamiha = list.some(
      (e) =>
        e.kind === "work" &&
        e.expectedStart === "08:00" &&
        e.expectedEnd === "16:30"
    );
    for (const e of list) {
      if (
        usualSamiha &&
        e.kind === "work" &&
        e.expectedStart === "09:00" &&
        e.expectedEnd === "17:30"
      ) {
        fixIds.push(e.id);
      }
    }

    const isKhira =
      list.some((e) => e.educatorId === "7") ||
      list.some((e) => /hemiss|om el khir|khir/i.test(e.pdfName));
    if (isKhira) {
      const work917 = list.filter(
        (e) =>
          e.kind === "work" &&
          e.expectedStart === "09:00" &&
          e.expectedEnd === "17:00"
      );
      const hasAbsence = list.some((e) => e.kind === "absence");
      if (work917.length === 4 && !hasAbsence) {
        const sorted = [...work917].sort(
          (a, b) => a.workDate.getTime() - b.workDate.getTime()
        );
        const fourth = sorted[3];
        if (fourth) fixIds.push(fourth.id);
      }
    }
  }

  return Array.from(new Set(fixIds));
}
