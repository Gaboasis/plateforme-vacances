import {
  addDays,
  differenceInDays,
  format,
  startOfDay,
} from "date-fns";
import { fr } from "date-fns/locale";
import type { Educator, VacationRequest, VacationRules } from "@/types";
import { getBiWeekFromDate } from "./biweek";
import { isDemoEducatorId } from "./demo-educator";
import { parseVacationDate } from "./vacation-dates";

export type DayCapacityRules = {
  maxConcurrent: number;
  minQualified: number;
  minNonQualified: number;
};

function getRulesForDate(date: Date, rules: VacationRules): DayCapacityRules {
  const biWeek = getBiWeekFromDate(date);
  const override = rules.biWeekRules?.[biWeek - 1];
  if (override) {
    return {
      maxConcurrent:
        override.maxConcurrentVacations ?? rules.maxConcurrentVacations,
      minQualified:
        override.minQualifiedPresent ?? rules.minQualifiedPresent,
      minNonQualified:
        override.minNonQualifiedPresent ?? rules.minNonQualifiedPresent,
    };
  }
  return {
    maxConcurrent: rules.maxConcurrentVacations,
    minQualified: rules.minQualifiedPresent,
    minNonQualified: rules.minNonQualifiedPresent,
  };
}

function isAcceptedOnDay(
  req: VacationRequest,
  day: Date
): boolean {
  if (req.status !== "accepted") return false;
  try {
    const s = startOfDay(parseVacationDate(req.startDate));
    const e = startOfDay(parseVacationDate(req.endDate));
    const d = startOfDay(day);
    return d >= s && d <= e;
  } catch {
    return false;
  }
}

export function educatorsOnVacationOnDay(
  day: Date,
  acceptedRequests: VacationRequest[],
  educators: Educator[]
): { qualifiedIds: Set<string>; nonQualifiedIds: Set<string> } {
  const qualifiedIds = new Set<string>();
  const nonQualifiedIds = new Set<string>();

  for (const r of acceptedRequests) {
    if (isDemoEducatorId(r.educatorId)) continue;
    if (!isAcceptedOnDay(r, day)) continue;
    const ed = educators.find((e) => e.id === r.educatorId);
    if (!ed || ed.role !== "educatrice") continue;
    if (ed.isQualified) qualifiedIds.add(r.educatorId);
    else nonQualifiedIds.add(r.educatorId);
  }

  return { qualifiedIds, nonQualifiedIds };
}

export type DayCapacityCheck = {
  ok: boolean;
  isLastSpot: boolean;
};

/** Peut-on ajouter le demandeur ce jour-là (congés acceptés déjà en base) ? */
export function checkDayCapacityForRequester(
  day: Date,
  requester: Educator,
  rules: VacationRules,
  acceptedRequests: VacationRequest[],
  educators: Educator[]
): DayCapacityCheck {
  const dayRules = getRulesForDate(day, rules);
  const onVac = educatorsOnVacationOnDay(day, acceptedRequests, educators);

  const qualifiedCount = educators.filter(
    (e) =>
      e.role === "educatrice" && e.isQualified && !isDemoEducatorId(e.id)
  ).length;
  const educatorIds = educators.filter(
    (e) => e.role === "educatrice" && !isDemoEducatorId(e.id)
  );
  const nonQualifiedCount = educatorIds.length - qualifiedCount;

  const requesterQualified = requester.isQualified === true;
  const alreadyAway =
    onVac.qualifiedIds.has(requester.id) ||
    onVac.nonQualifiedIds.has(requester.id);

  let qualifiedAway = onVac.qualifiedIds.size;
  let nonQualifiedAway = onVac.nonQualifiedIds.size;
  if (!alreadyAway) {
    if (requesterQualified) qualifiedAway += 1;
    else nonQualifiedAway += 1;
  }

  if (qualifiedCount - qualifiedAway < dayRules.minQualified) {
    return { ok: false, isLastSpot: false };
  }
  if (nonQualifiedCount - nonQualifiedAway < dayRules.minNonQualified) {
    return { ok: false, isLastSpot: false };
  }

  const uniqueAway = new Set<string>([
    ...Array.from(onVac.qualifiedIds),
    ...Array.from(onVac.nonQualifiedIds),
  ]);
  if (!alreadyAway) uniqueAway.add(requester.id);

  if (uniqueAway.size > dayRules.maxConcurrent) {
    return { ok: false, isLastSpot: false };
  }

  const isLastSpot = uniqueAway.size === dayRules.maxConcurrent;
  return { ok: true, isLastSpot };
}

export function mergeConsecutiveDaysToPeriods(
  days: Date[]
): { startDate: string; endDate: string }[] {
  if (days.length === 0) return [];
  const sorted = [...days]
    .map((d) => startOfDay(d))
    .sort((a, b) => a.getTime() - b.getTime());

  const out: { startDate: string; endDate: string }[] = [];
  let rangeStart = sorted[0]!;
  let rangeEnd = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i]!;
    if (differenceInDays(d, rangeEnd) === 1) {
      rangeEnd = d;
    } else {
      out.push({
        startDate: format(rangeStart, "yyyy-MM-dd"),
        endDate: format(rangeEnd, "yyyy-MM-dd"),
      });
      rangeStart = d;
      rangeEnd = d;
    }
  }
  out.push({
    startDate: format(rangeStart, "yyyy-MM-dd"),
    endDate: format(rangeEnd, "yyyy-MM-dd"),
  });
  return out;
}

export function analyzeVacationPeriodByDay(
  startDate: string,
  endDate: string,
  requester: Educator,
  rules: VacationRules,
  acceptedRequests: VacationRequest[],
  educators: Educator[]
): {
  conflictingDates: string[];
  suggestedPeriods: { startDate: string; endDate: string }[];
  requiresManualReview: boolean;
  allDaysOk: boolean;
} {
  const start = startOfDay(parseVacationDate(startDate));
  const end = startOfDay(parseVacationDate(endDate));
  const conflictingDates: string[] = [];
  const validDays: Date[] = [];
  let requiresManualReview = false;

  let current = startOfDay(start);
  const endDay = startOfDay(end);

  while (current <= endDay) {
    const check = checkDayCapacityForRequester(
      current,
      requester,
      rules,
      acceptedRequests,
      educators
    );
    const iso = format(current, "yyyy-MM-dd");
    if (check.ok) {
      validDays.push(new Date(current));
      const dayMax = getRulesForDate(current, rules).maxConcurrent;
      if (check.isLastSpot && dayMax >= 3) {
        requiresManualReview = true;
      }
    } else {
      conflictingDates.push(iso);
    }
    current = addDays(current, 1);
  }

  return {
    conflictingDates,
    suggestedPeriods: mergeConsecutiveDaysToPeriods(validDays),
    requiresManualReview,
    allDaysOk: conflictingDates.length === 0,
  };
}

/** Limite simultanée affichée pour une date en conflit (semaine ISO / règle admin). */
export function maxConcurrentForDate(
  isoDate: string,
  rules: VacationRules
): number {
  return getRulesForDate(parseVacationDate(isoDate), rules).maxConcurrent;
}

export function formatConflictDatesList(isoDates: string[]): string {
  if (isoDates.length === 0) return "";
  const shown = isoDates.slice(0, 8).map((d) =>
    format(parseVacationDate(d), "d MMM yyyy", { locale: fr })
  );
  const extra =
    isoDates.length > 8 ? ` (+${isoDates.length - 8} autre(s) jour(s))` : "";
  return shown.join(", ") + extra;
}

/** Jours où une éducatrice est en congé accepté (pour calendrier). */
export function expandAcceptedVacationToDays(
  requests: VacationRequest[],
  rangeStart: Date,
  rangeEnd: Date
): Map<string, { educatorId: string; educatorName: string }[]> {
  const map = new Map<string, { educatorId: string; educatorName: string }[]>();

  for (const r of requests) {
    if (r.status !== "accepted" || isDemoEducatorId(r.educatorId)) continue;
    try {
      const s = startOfDay(parseVacationDate(r.startDate));
      const e = startOfDay(parseVacationDate(r.endDate));
      let d = s < rangeStart ? rangeStart : s;
      const last = e > rangeEnd ? rangeEnd : e;
      d = startOfDay(d);
      while (d <= last) {
        const key = format(d, "yyyy-MM-dd");
        const list = map.get(key) ?? [];
        if (!list.some((x) => x.educatorId === r.educatorId)) {
          list.push({
            educatorId: r.educatorId,
            educatorName: r.educatorName,
          });
        }
        map.set(key, list);
        d = addDays(d, 1);
      }
    } catch {
      /* skip */
    }
  }

  map.forEach((list) => {
    list.sort((a, b) => a.educatorName.localeCompare(b.educatorName, "fr"));
  });
  return map;
}

/** Jours où le nombre de congés acceptés dépasse la limite configurée (incohérence à corriger). */
export function findDaysOverConcurrentLimit(
  rules: VacationRules,
  requests: VacationRequest[],
  educators: Educator[],
  rangeStart: Date,
  rangeEnd: Date
): { date: string; educatorNames: string[]; count: number; limit: number }[] {
  const map = expandAcceptedVacationToDays(requests, rangeStart, rangeEnd);
  const out: {
    date: string;
    educatorNames: string[];
    count: number;
    limit: number;
  }[] = [];

  map.forEach((list, dateKey) => {
    const day = parseVacationDate(dateKey);
    const limit = getRulesForDate(day, rules).maxConcurrent;
    if (list.length > limit) {
      out.push({
        date: dateKey,
        educatorNames: list.map((x) => x.educatorName),
        count: list.length,
        limit,
      });
    }
  });

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
