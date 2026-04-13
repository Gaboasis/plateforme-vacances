import {
  addDays,
  differenceInCalendarMonths,
  endOfDay,
  parseISO,
  startOfDay,
  subDays,
  subMonths,
} from "date-fns";

export type SelfCancelRuleBucket =
  | "twoMonthsBeforeStart"
  | "fortyFiveDaysBefore"
  | "twentyFiveDaysBefore"
  | "fiveDaysAfterRequest";

/**
 * Nombre de mois calendaires complets entre la date de la demande et le début des vacances.
 */
export function vacationMonthsAfterRequest(
  createdAtIso: string,
  vacationStartDateIso: string
): number {
  const c = startOfDay(parseISO(createdAtIso.slice(0, 10)));
  const s = startOfDay(parseISO(vacationStartDateIso));
  return differenceInCalendarMonths(s, c);
}

function bucketForMonths(m: number): SelfCancelRuleBucket {
  if (m >= 6 || m === 5) return "twoMonthsBeforeStart";
  if (m === 4 || m === 3) return "fortyFiveDaysBefore";
  if (m === 2) return "twentyFiveDaysBefore";
  return "fiveDaysAfterRequest";
}

/**
 * Dernier instant (inclus) où l’employé peut annuler seul un congé déjà accepté.
 */
export function getEmployeeSelfCancelLastMoment(
  createdAtIso: string,
  vacationStartDateIso: string
): { lastMoment: Date; bucket: SelfCancelRuleBucket; labelFr: string } {
  const c = startOfDay(parseISO(createdAtIso.slice(0, 10)));
  const s = startOfDay(parseISO(vacationStartDateIso));
  const m = differenceInCalendarMonths(s, c);
  const bucket = bucketForMonths(m);

  if (bucket === "twoMonthsBeforeStart") {
    const twoCalMonthsBefore = startOfDay(subMonths(s, 2));
    const lastMoment = endOfDay(subDays(twoCalMonthsBefore, 1));
    return {
      lastMoment,
      bucket,
      labelFr:
        "Jusqu’à la veille du jour situé 2 mois calendaires avant le début des vacances (ensuite : annulation seulement avec l’admin).",
    };
  }

  if (bucket === "fortyFiveDaysBefore") {
    const lastMoment = endOfDay(subDays(s, 46));
    return {
      lastMoment,
      bucket,
      labelFr:
        "Jusqu’à 46 jours avant le début des vacances inclus (puis annulation avec l’admin seulement).",
    };
  }

  if (bucket === "twentyFiveDaysBefore") {
    const lastMoment = endOfDay(subDays(s, 26));
    return {
      lastMoment,
      bucket,
      labelFr:
        "Jusqu’à 26 jours avant le début des vacances inclus (puis annulation avec l’admin seulement).",
    };
  }

  const lastMoment = endOfDay(addDays(c, 5));
  return {
    lastMoment,
    bucket,
    labelFr:
      "Jusqu’à 5 jours après la date de la demande inclus (puis annulation avec l’admin seulement).",
  };
}

export function canEmployeeSelfCancelAcceptedNow(
  createdAtIso: string,
  vacationStartDateIso: string,
  now: Date = new Date()
): boolean {
  const { lastMoment } = getEmployeeSelfCancelLastMoment(
    createdAtIso,
    vacationStartDateIso
  );
  return now.getTime() <= lastMoment.getTime();
}
