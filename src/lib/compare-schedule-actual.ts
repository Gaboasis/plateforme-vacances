import type { ScheduleDayKind } from "./parse-employee-schedule-pdf";

export type ScheduleVarianceKind =
  | "late"
  | "early_departure"
  | "overtime_end"
  | "absence_but_worked"
  | "vacation_but_worked"
  | "expected_work_missing"
  | "unexpected_work"
  | "no_schedule";

export type ScheduleVariance = {
  educatorId: string;
  educatorName: string;
  kind: ScheduleVarianceKind;
  message: string;
  expectedStart?: string;
  expectedEnd?: string;
  actualIn?: string;
  actualOut?: string;
  minutesDelta?: number;
  scheduledKind?: ScheduleDayKind;
};

const LATE_TOLERANCE_MIN = 5;
const END_TOLERANCE_MIN = 5;

function timeToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function compareScheduleToActual(options: {
  educatorId: string;
  educatorName: string;
  scheduledKind?: ScheduleDayKind;
  expectedStart?: string;
  expectedEnd?: string;
  actualIn?: string;
  actualOut?: string;
  hoursWorked?: number;
}): ScheduleVariance[] {
  const {
    educatorId,
    educatorName,
    scheduledKind,
    expectedStart,
    expectedEnd,
    actualIn,
    actualOut,
    hoursWorked,
  } = options;

  const hasWork =
    (hoursWorked != null && hoursWorked > 0) ||
    Boolean(actualIn?.trim()) ||
    Boolean(actualOut?.trim());

  const out: ScheduleVariance[] = [];

  if (!scheduledKind) {
    if (hasWork) {
      out.push({
        educatorId,
        educatorName,
        kind: "no_schedule",
        message: "Heures saisies mais aucun horaire prévu trouvé pour cette date.",
      });
    }
    return out;
  }

  if (scheduledKind === "absence" && hasWork) {
    out.push({
      educatorId,
      educatorName,
      kind: "absence_but_worked",
      scheduledKind,
      message: "Absence prévue à l'horaire, mais des heures sont saisies.",
      actualIn,
      actualOut,
    });
  }

  if (scheduledKind === "vacation" && hasWork) {
    out.push({
      educatorId,
      educatorName,
      kind: "vacation_but_worked",
      scheduledKind,
      message: "Vacances prévues à l'horaire, mais des heures sont saisies.",
      actualIn,
      actualOut,
    });
  }

  if (scheduledKind === "work") {
    if (!hasWork) {
      out.push({
        educatorId,
        educatorName,
        kind: "expected_work_missing",
        scheduledKind,
        expectedStart,
        expectedEnd,
        message: `Travail prévu ${expectedStart ?? "?"}–${expectedEnd ?? "?"}, aucune heure saisie.`,
      });
      return out;
    }

    if (expectedStart && actualIn) {
      const delta = timeToMinutes(actualIn) - timeToMinutes(expectedStart);
      if (delta > LATE_TOLERANCE_MIN) {
        out.push({
          educatorId,
          educatorName,
          kind: "late",
          scheduledKind,
          expectedStart,
          expectedEnd,
          actualIn,
          actualOut,
          minutesDelta: delta,
          message: `Retard : arrivée ${actualIn} (prévu ${expectedStart}, +${delta} min).`,
        });
      } else if (delta < -LATE_TOLERANCE_MIN) {
        out.push({
          educatorId,
          educatorName,
          kind: "unexpected_work",
          scheduledKind,
          expectedStart,
          expectedEnd,
          actualIn,
          actualOut,
          minutesDelta: delta,
          message: `Arrivée plus tôt : ${actualIn} (prévu ${expectedStart}).`,
        });
      }
    }

    if (!actualIn && !actualOut && hoursWorked != null && hoursWorked > 0) {
      out.push({
        educatorId,
        educatorName,
        kind: "unexpected_work",
        scheduledKind,
        expectedStart,
        expectedEnd,
        message: `Travail prévu ${expectedStart ?? "?"}–${expectedEnd ?? "?"} — ${hoursWorked} h payables saisies (importez le PDF présences pour détecter les retards in/out).`,
      });
    }

    if (expectedEnd && actualOut) {
      const delta = timeToMinutes(actualOut) - timeToMinutes(expectedEnd);
      if (delta < -END_TOLERANCE_MIN) {
        out.push({
          educatorId,
          educatorName,
          kind: "early_departure",
          scheduledKind,
          expectedStart,
          expectedEnd,
          actualIn,
          actualOut,
          minutesDelta: delta,
          message: `Départ anticipé : ${actualOut} (prévu ${expectedEnd}, ${Math.abs(delta)} min).`,
        });
      } else if (delta > END_TOLERANCE_MIN) {
        out.push({
          educatorId,
          educatorName,
          kind: "overtime_end",
          scheduledKind,
          expectedStart,
          expectedEnd,
          actualIn,
          actualOut,
          minutesDelta: delta,
          message: `Départ plus tard : ${actualOut} (prévu ${expectedEnd}, +${delta} min).`,
        });
      }
    }
  }

  return out;
}
