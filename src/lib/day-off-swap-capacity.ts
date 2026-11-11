import { addDays, format, getISODay, getISOWeekYear, startOfDay } from "date-fns";
import type { Educator, VacationRequest, VacationRules } from "@/types";
import { getBiWeekDateRange, getBiWeekFromDate } from "./biweek";
import { educatorsOnVacationOnDay } from "./vacation-day-capacity";
import { isDemoEducatorId } from "./demo-educator";

export type DayOffSwapRatioCheck = {
  ok: boolean;
  /** Dates (yyyy-MM-dd) où le ratio minimum serait enfreint après l’échange */
  conflictingDates: string[];
  message: string;
};

type DayCapacityRules = {
  minQualified: number;
  minNonQualified: number;
};

function getRulesForDate(date: Date, rules: VacationRules): DayCapacityRules {
  const weekNum = Math.min(52, Math.max(1, getBiWeekFromDate(date)));
  const override = rules.biWeekRules?.[weekNum - 1];
  if (override) {
    return {
      minQualified: override.minQualifiedPresent ?? rules.minQualifiedPresent,
      minNonQualified:
        override.minNonQualifiedPresent ?? rules.minNonQualifiedPresent,
    };
  }
  return {
    minQualified: rules.minQualifiedPresent,
    minNonQualified: rules.minNonQualifiedPresent,
  };
}

/** Vérifie les ratios qualifiées / non qualifiées sur les journées touchées par l’échange (semaine courante). */
export function checkDayOffSwapRatio(
  params: {
    requesterId: string;
    requesterIsQualified: boolean;
    requesterOffDay: number;
    accepterId: string;
    accepterIsQualified: boolean;
    counterpartyOffDay: number;
  },
  rules: VacationRules,
  acceptedRequests: VacationRequest[],
  educators: Educator[]
): DayOffSwapRatioCheck {
  const year = getISOWeekYear(new Date());
  const weekNum = getBiWeekFromDate(new Date());
  const { start, end } = getBiWeekDateRange(weekNum, year);

  const qualifiedTotal = educators.filter(
    (e) =>
      e.role === "educatrice" && e.isQualified && !isDemoEducatorId(e.id)
  ).length;
  const educatorIds = educators.filter(
    (e) => e.role === "educatrice" && !isDemoEducatorId(e.id)
  );
  const nonQualifiedTotal = educatorIds.length - qualifiedTotal;

  const conflictingDates: string[] = [];
  let cursor = startOfDay(start);
  const endDay = startOfDay(end);

  while (cursor <= endDay) {
    const isoDay = getISODay(cursor);
    const touchesSwap =
      isoDay === params.requesterOffDay || isoDay === params.counterpartyOffDay;

    if (touchesSwap) {
      const onVac = educatorsOnVacationOnDay(cursor, acceptedRequests, educators);
      const awayQualified = new Set(onVac.qualifiedIds);
      const awayNonQualified = new Set(onVac.nonQualifiedIds);

      const markAway = (id: string, qualified: boolean) => {
        if (qualified) {
          awayQualified.add(id);
          awayNonQualified.delete(id);
        } else {
          awayNonQualified.add(id);
          awayQualified.delete(id);
        }
      };
      const markPresent = (id: string) => {
        awayQualified.delete(id);
        awayNonQualified.delete(id);
      };

      const onVacation = (id: string) =>
        onVac.qualifiedIds.has(id) || onVac.nonQualifiedIds.has(id);

      if (isoDay === params.requesterOffDay) {
        if (!onVacation(params.requesterId)) markPresent(params.requesterId);
        if (!onVacation(params.accepterId)) {
          markAway(params.accepterId, params.accepterIsQualified);
        }
      }
      if (isoDay === params.counterpartyOffDay) {
        if (!onVacation(params.accepterId)) markPresent(params.accepterId);
        if (!onVacation(params.requesterId)) {
          markAway(params.requesterId, params.requesterIsQualified);
        }
      }

      const dayRules = getRulesForDate(cursor, rules);
      const qualifiedPresent = qualifiedTotal - awayQualified.size;
      const nonQualifiedPresent = nonQualifiedTotal - awayNonQualified.size;

      if (
        qualifiedPresent < dayRules.minQualified ||
        nonQualifiedPresent < dayRules.minNonQualified
      ) {
        conflictingDates.push(format(cursor, "yyyy-MM-dd"));
      }
    }

    cursor = addDays(cursor, 1);
  }

  if (conflictingDates.length === 0) {
    return {
      ok: true,
      conflictingDates: [],
      message: "Ratios respectés sur les journées concernées (semaine en cours).",
    };
  }

  return {
    ok: false,
    conflictingDates,
    message:
      "Après cet échange, le minimum de présences qualifiées ou non qualifiées ne serait pas respecté le(s) : " +
      conflictingDates.join(", ") +
      ".",
  };
}
