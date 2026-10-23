/** Parse PDF « Horaire employé » (GAB / garderie). */

import { matchPdfNameToEducator } from "./parse-presence-pdf";

export type ScheduleDayKind = "work" | "absence" | "vacation" | "unknown";

export type ParsedScheduleDay = {
  dayIndex: number;
  workDate: string;
  kind: ScheduleDayKind;
  expectedStart?: string;
  expectedEnd?: string;
};

export type ParsedScheduleEmployee = {
  pdfName: string;
  roleLabel: string;
  days: ParsedScheduleDay[];
};

export type ParsedWeeklySchedule = {
  periodStart: string;
  periodEnd: string;
  workDates: string[];
  employees: ParsedScheduleEmployee[];
};

const ROLE_LINE =
  /^(Cuisinière|Remplaçante|Éducatrice qualifiée|Éducatrice non qualifiée|Préposée|Secrétaire)$/i;

const TIME_RANGE_RE = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;

const PERIOD_RE =
  /Période du (\d{4}-\d{2}-\d{2}) au (\d{4}-\d{2}-\d{2})/i;

const DAY_HEADER_RE =
  /Lundi le (\d{1,2}).*?Mardi le (\d{1,2}).*?Mercredi le (\d{1,2}).*?Jeudi le (\d{1,2}).*?Vendredi le (\d{1,2})/i;

function padTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
}

function parseWorkDates(
  periodStart: string,
  periodEnd: string,
  dayNumbers: number[]
): string[] {
  const start = new Date(`${periodStart}T12:00:00`);
  const end = new Date(`${periodEnd}T12:00:00`);
  const month = start.getMonth();
  const year = start.getFullYear();

  const fromHeader = dayNumbers.map((d) => {
    const dt = new Date(year, month, d, 12, 0, 0);
    const iso = dt.toISOString().slice(0, 10);
    if (iso >= periodStart && iso <= periodEnd) return iso;
    const dt2 = new Date(year, month + 1, d, 12, 0, 0);
    return dt2.toISOString().slice(0, 10);
  });

  if (fromHeader.length === 5 && fromHeader.every((d) => d >= periodStart && d <= periodEnd)) {
    return fromHeader;
  }

  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      out.push(d.toISOString().slice(0, 10));
    }
  }
  return out.slice(0, 5);
}

function parseDaySlot(lines: string[], startIdx: number): {
  day: Omit<ParsedScheduleDay, "dayIndex" | "workDate">;
  nextIdx: number;
} {
  let i = startIdx;
  let kind: ScheduleDayKind = "unknown";
  let expectedStart: string | undefined;
  let expectedEnd: string | undefined;

  if (i >= lines.length) {
    return { day: { kind }, nextIdx: i };
  }

  let head = lines[i]!.trim();
  i++;

  if (/^Vacances/i.test(head)) {
    return { day: { kind: "vacation" }, nextIdx: i };
  }
  if (/^AbsenceTravail/i.test(head)) {
    head = "Travail";
  } else if (/^Absence/i.test(head)) {
    return { day: { kind: "absence" }, nextIdx: i };
  }

  if (/^Travail/i.test(head)) {
    kind = "work";
    while (i < lines.length) {
      const line = lines[i]!.trim();
      const tm = TIME_RANGE_RE.exec(line);
      if (tm) {
        expectedStart = padTime(tm[1]);
        expectedEnd = padTime(tm[2]);
        i++;
        break;
      }
      if (ROLE_LINE.test(line)) break;
      if (
        line.length > 2 &&
        !/^Travail|^Absence|^Vacances/.test(line) &&
        !TIME_RANGE_RE.test(line)
      ) {
        i++;
        continue;
      }
      if (/^Travail|^Absence|^Vacances/.test(line)) break;
      i++;
    }
    return { day: { kind, expectedStart, expectedEnd }, nextIdx: i };
  }

  return { day: { kind }, nextIdx: i };
}

export function parseEmployeeSchedulePdfText(text: string): ParsedWeeklySchedule | null {
  const periodM = PERIOD_RE.exec(text);
  if (!periodM) return null;

  const periodStart = periodM[1]!;
  const periodEnd = periodM[2]!;

  const headerM = DAY_HEADER_RE.exec(text.replace(/\s+/g, " "));
  const dayNums = headerM
    ? [
        parseInt(headerM[1], 10),
        parseInt(headerM[2], 10),
        parseInt(headerM[3], 10),
        parseInt(headerM[4], 10),
        parseInt(headerM[5], 10),
      ]
    : [];

  const workDates = parseWorkDates(periodStart, periodEnd, dayNums);
  if (workDates.length === 0) return null;

  const bodyEnd = text.search(/Période du/i);
  const body = (bodyEnd > 0 ? text.slice(0, bodyEnd) : text).trim();
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const employeeStarts: number[] = [];
  for (let j = 0; j < lines.length - 1; j++) {
    if (ROLE_LINE.test(lines[j + 1]!)) employeeStarts.push(j);
  }

  const employees: ParsedScheduleEmployee[] = [];

  for (let e = 0; e < employeeStarts.length; e++) {
    const nameIdx = employeeStarts[e]!;
    const nextNameIdx = employeeStarts[e + 1] ?? lines.length;
    const pdfName = lines[nameIdx]!;
    const roleLabel = lines[nameIdx + 1]!;
    const block = lines.slice(nameIdx + 2, nextNameIdx);

    const days: ParsedScheduleDay[] = [];
    let i = 0;
    for (let d = 0; d < workDates.length; d++) {
      const { day, nextIdx } = parseDaySlot(block, i);
      i = nextIdx;
      days.push({
        dayIndex: d,
        workDate: workDates[d]!,
        ...day,
      });
    }

    employees.push({ pdfName, roleLabel, days });
  }

  return { periodStart, periodEnd, workDates, employees };
}

export type MatchedScheduleEntry = {
  educatorId: string;
  educatorName: string;
  pdfName: string;
  roleLabel: string;
  workDate: string;
  kind: ScheduleDayKind;
  expectedStart?: string;
  expectedEnd?: string;
};

export function matchScheduleToEducators(
  parsed: ParsedWeeklySchedule,
  educators: { id: string; name: string }[]
): {
  entries: MatchedScheduleEntry[];
  unmatchedPdfNames: string[];
} {
  const entries: MatchedScheduleEntry[] = [];
  const unmatchedPdfNames: string[] = [];

  for (const emp of parsed.employees) {
    const edu = matchPdfNameToEducator(emp.pdfName, educators);
    if (!edu) {
      unmatchedPdfNames.push(emp.pdfName);
      continue;
    }
    for (const day of emp.days) {
      entries.push({
        educatorId: edu.id,
        educatorName: edu.name,
        pdfName: emp.pdfName,
        roleLabel: emp.roleLabel,
        workDate: day.workDate,
        kind: day.kind,
        expectedStart: day.expectedStart,
        expectedEnd: day.expectedEnd,
      });
    }
  }

  return {
    entries,
    unmatchedPdfNames: Array.from(new Set(unmatchedPdfNames)),
  };
}
