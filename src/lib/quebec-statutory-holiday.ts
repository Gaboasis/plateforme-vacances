/**
 * Indemnité de jour férié chômé (Québec — Loi sur les normes du travail).
 *
 * Règle : 1/20 du salaire gagné durant les **4 semaines de paie complètes**
 * qui **précèdent la semaine** du jour férié (semaine = lundi → dimanche).
 *
 * Les salaires de référence peuvent tomber **en dehors** de la période d’analyse
 * choisie par l’utilisateur ; seules les dates des fériés doivent être dans la période.
 */

export type ReferencePayWindow = {
  referenceFrom: string;
  referenceTo: string;
};

export type HolidayIndemnityLine = {
  educatorId: string;
  educatorName: string;
  holidayDate: string;
  referenceFrom: string;
  referenceTo: string;
  referenceGrossCents: number;
  referenceDaysWorked: number;
  indemnityCents: number;
};

export type EducatorHolidayIndemnitySummary = {
  educatorId: string;
  educatorName: string;
  totalIndemnityCents: number;
  lines: HolidayIndemnityLine[];
};

function parseDateOnlyUtc(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) throw new Error(`Date invalide : ${dateStr}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function formatDateOnlyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lundi (UTC) de la semaine civile contenant la date du férié. */
export function startOfHolidayWeekUtc(holidayDateStr: string): Date {
  const d = parseDateOnlyUtc(holidayDateStr);
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + mondayOffset);
  return monday;
}

/** 4 semaines complètes immédiatement avant la semaine du jour férié. */
export function referencePayWindowForHoliday(
  holidayDateStr: string
): ReferencePayWindow {
  const holidayWeekStart = startOfHolidayWeekUtc(holidayDateStr);
  const referenceEnd = new Date(holidayWeekStart);
  referenceEnd.setUTCDate(holidayWeekStart.getUTCDate() - 1);
  const referenceStart = new Date(holidayWeekStart);
  referenceStart.setUTCDate(holidayWeekStart.getUTCDate() - 28);
  return {
    referenceFrom: formatDateOnlyUtc(referenceStart),
    referenceTo: formatDateOnlyUtc(referenceEnd),
  };
}

export function indemnityCentsForReferenceGross(referenceGrossCents: number): number {
  if (referenceGrossCents <= 0) return 0;
  return Math.round(referenceGrossCents / 20);
}

export type GrossByEducatorDay = Map<string, Map<string, { gross: number; name: string }>>;

export function sumReferenceGrossForEducator(
  data: GrossByEducatorDay,
  educatorId: string,
  referenceFrom: string,
  referenceTo: string
): { grossCents: number; daysWorked: number; name: string } {
  const byDay = data.get(educatorId);
  if (!byDay) {
    return { grossCents: 0, daysWorked: 0, name: educatorId };
  }
  let grossCents = 0;
  let daysWorked = 0;
  let name = educatorId;
  for (const [day, entry] of Array.from(byDay.entries())) {
    if (day >= referenceFrom && day <= referenceTo) {
      grossCents += entry.gross;
      daysWorked += 1;
      name = entry.name;
    }
  }
  return { grossCents, daysWorked, name };
}

/**
 * Calcule l’indemnité pour chaque férié (date dans la période analysée)
 * en utilisant les salaires bruts des journaux sur la fenêtre de 4 semaines.
 */
export function computeStatutoryHolidayIndemnitiesFromJournals(options: {
  holidayDatesInPeriod: string[];
  grossByEducatorDay: GrossByEducatorDay;
}): {
  lines: HolidayIndemnityLine[];
  byEducator: EducatorHolidayIndemnitySummary[];
  totalCents: number;
} {
  const lines: HolidayIndemnityLine[] = [];
  const sortedHolidays = [...options.holidayDatesInPeriod].sort();

  for (const holidayDate of sortedHolidays) {
    const { referenceFrom, referenceTo } =
      referencePayWindowForHoliday(holidayDate);

    const educatorIds = new Set<string>(options.grossByEducatorDay.keys());

    for (const educatorId of Array.from(educatorIds)) {
      const { grossCents, daysWorked, name } = sumReferenceGrossForEducator(
        options.grossByEducatorDay,
        educatorId,
        referenceFrom,
        referenceTo
      );
      const indemnityCents = indemnityCentsForReferenceGross(grossCents);
      if (indemnityCents <= 0) continue;

      lines.push({
        educatorId,
        educatorName: name,
        holidayDate,
        referenceFrom,
        referenceTo,
        referenceGrossCents: grossCents,
        referenceDaysWorked: daysWorked,
        indemnityCents,
      });
    }
  }

  const byEducatorMap = new Map<string, EducatorHolidayIndemnitySummary>();
  for (const line of lines) {
    const cur = byEducatorMap.get(line.educatorId) ?? {
      educatorId: line.educatorId,
      educatorName: line.educatorName,
      totalIndemnityCents: 0,
      lines: [],
    };
    cur.totalIndemnityCents += line.indemnityCents;
    cur.lines.push(line);
    byEducatorMap.set(line.educatorId, cur);
  }

  const byEducator = Array.from(byEducatorMap.values()).sort((a, b) =>
    a.educatorName.localeCompare(b.educatorName, "fr")
  );
  const totalCents = lines.reduce((s, l) => s + l.indemnityCents, 0);

  return { lines, byEducator, totalCents };
}
