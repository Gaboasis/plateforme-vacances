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

/** Sans accents — le PDF peut mélanger Unicode combiné (é vs e + accent). */
function normAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isEducatriceFirstLine(line: string): boolean {
  return normAscii(line) === "educatrice";
}

function isQualifieeLine(line: string | undefined): boolean {
  if (!line) return false;
  return normAscii(line) === "qualifiee";
}

function isNonLine(line: string | undefined): boolean {
  if (!line) return false;
  return normAscii(line) === "non";
}

/** PDF : « Éducatrice » et « qualifiée » parfois sur deux lignes → sinon le bloc suivant n’est pas détecté. */
function normalizeSchedulePdfBodyLines(rawLines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i]!.trim();
    const n1 = rawLines[i + 1]?.trim();
    const n2 = rawLines[i + 2]?.trim();
    if (isEducatriceFirstLine(line) && isQualifieeLine(n1)) {
      out.push("Éducatrice qualifiée");
      i += 2;
      continue;
    }
    if (isEducatriceFirstLine(line) && isNonLine(n1) && isQualifieeLine(n2)) {
      out.push("Éducatrice non qualifiée");
      i += 3;
      continue;
    }
    // « Éducatrice non » sur une ligne + « qualifiée » (PDF compact ou césure).
    if (normAscii(line) === "educatrice non" && isQualifieeLine(n1)) {
      out.push("Éducatrice non qualifiée");
      i += 2;
      continue;
    }
    out.push(line);
    i++;
  }
  return out;
}

/** pdf-parse colle parfois « Absence » et « AbsenceTravail » sur une ligne (2e page / césure). */
function splitGluedDayHeadLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    const compact = t.replace(/\s+/g, "");
    if (/^absenceabsencetravail$/i.test(compact)) {
      /* Une seule cellule métier : « Absence » + « AbsenceTravail » collés ≠ deux jours. */
      out.push("AbsenceTravail");
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * Bloc « Mohamed Hosny Shaimaa » : la ligne de rôle manque après césure 2ᵉ page.
 * Insérer **une seule fois** avant le 1er jour (ligne « Absence » ou « Travail »), sans polluer les blocs suivants.
 */
function injectShaimaMissingRoleLine(lines: string[]): string[] {
  const out = [...lines];
  const dayHead = /^(Travail|Absence|Vacances|AbsenceTravail)\b/i;
  for (let i = 0; i < out.length; i++) {
    const line = out[i]!.trim();
    if (!dayHead.test(line)) continue;
    if (ROLE_LINE.test(out[i - 1]!)) continue;

    let sawShaimaContext = false;
    for (let b = 1; b <= 5 && i - b >= 0; b++) {
      const prev = out[i - b]!;
      if (ROLE_LINE.test(prev)) break;
      if (/shaimaa|mohamed hosny|horaire de/i.test(prev)) {
        sawShaimaContext = true;
        break;
      }
    }
    if (!sawShaimaContext) continue;

    out.splice(i, 0, "Éducatrice qualifiée");
    return out;
  }
  return out;
}

/** Tiret ASCII, demi-cadratin ou cadratin (souvent dans les PDF). */
const TIME_RANGE_RE = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/;

/** Parenthèses sur 1 ou plusieurs lignes (ex. « (Souhir \n Romdhane ) »). */
function extractSubstituteNamesFromDayLines(dayLines: string[]): string[] {
  const blob = dayLines.join("\n");
  const out: string[] = [];
  let pos = 0;
  while (pos < blob.length) {
    const open = blob.indexOf("(", pos);
    if (open < 0) break;
    let depth = 0;
    let j = open;
    for (; j < blob.length; j++) {
      const ch = blob[j]!;
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    if (depth !== 0) {
      pos = open + 1;
      continue;
    }
    const inner = blob
      .slice(open + 1, j - 1)
      .replace(/\s+/g, " ")
      .trim();
    const ascii = normAscii(inner).replace(/[^a-z0-9\s'.-]/g, " ").replace(/\s+/g, " ").trim();
    if (ascii.length >= 3 && /^[a-z0-9\s'.-]+$/i.test(ascii)) {
      const parts = inner.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        out.push(inner);
      }
    }
    pos = j;
  }
  return Array.from(new Set(out));
}

const PERIOD_RE =
  /Période du (\d{4}-\d{2}-\d{2}) au (\d{4}-\d{2}-\d{2})/gi;

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

/** Ligne de nom avant le rôle (pas une cellule jour ni un en-tête de groupe). */
function isScheduleEmployeeNameLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2) return false;
  if (ROLE_LINE.test(t)) return false;
  if (TIME_RANGE_RE.test(t)) return false;
  if (/\d{1,2}:\d{2}/.test(t)) return false;
  if (isScheduleDayCellHeaderLine(t)) return false;
  if (/^Les\b/i.test(t)) return false;
  // Tranches d’âge / libellés de groupe (ex. « 2-3 ans Les Jasmins », « 0-18 mois »)
  if (/\d+\s*[-–]\s*\d+/.test(t)) return false;
  if (/\b(mois|ans)\b/i.test(t)) return false;
  if (/^\d/.test(t)) return false;
  if (/^horaire de\b/i.test(t)) return false;
  return true;
}

const DAY_CELL_HEAD_RE =
  /^(Travail|Absence|Vacances|AbsenceTravail)\b/i;

/** Caractères invisibles parfois collés avant « Travail » dans l’extraction PDF. */
function stripScheduleCellLine(line: string): string {
  return line.replace(/^[\uFEFF\u200B-\u200D\u2060]+/, "").trim();
}

function isScheduleDayCellHeaderLine(line: string): boolean {
  return DAY_CELL_HEAD_RE.test(stripScheduleCellLine(line));
}

/** « Prénom Nom » sur sa propre ligne juste avant la ligne de rôle = employé suivant (ne pas l’absorber dans la case). */
function isEmployeeNameThenRoleLine(lines: string[], idx: number): boolean {
  const L = lines[idx]?.trim() ?? "";
  if (!/^[A-Za-zÀ-Ÿ][a-zà-ÿ]*\s+[A-Za-zÀ-Ÿ][a-zà-ÿ]/.test(L)) return false;
  if (/\d/.test(L)) return false;
  const next = lines[idx + 1]?.trim() ?? "";
  return ROLE_LINE.test(next);
}

/** Une « case » jour : en-tête (Travail/Absence/…) + libellés jusqu’au prochain en-tête de jour ou employé. */
function collectScheduleDayCell(lines: string[], startIdx: number): {
  cell: string[];
  nextIdx: number;
} {
  if (startIdx >= lines.length) return { cell: [], nextIdx: startIdx };
  if (!isScheduleDayCellHeaderLine(lines[startIdx]!)) {
    return { cell: [lines[startIdx]!], nextIdx: startIdx + 1 };
  }

  const cell: string[] = [lines[startIdx]!];
  let i = startIdx + 1;
  while (i < lines.length) {
    const L = stripScheduleCellLine(lines[i]!);
    if (ROLE_LINE.test(L)) break;
    if (isEmployeeNameThenRoleLine(lines, i)) break;
    if (isScheduleDayCellHeaderLine(L)) break;
    cell.push(lines[i]!);
    i++;
  }
  return { cell, nextIdx: i };
}

/**
 * Règle métier : lire **toute** la case (souvent plusieurs lignes sur 2 pages).
 * Priorité : Travail → travail | Vacances → congés | AbsenceTravail → absence | Absence → absence
 */
function classifyDayCellByKeywords(cellLines: string[]): Omit<
  ParsedScheduleDay,
  "dayIndex" | "workDate"
> {
  const headRaw = stripScheduleCellLine(cellLines[0] ?? "");
  const compactHead = normAscii(headRaw).replace(/\s+/g, "");

  const blob = cellLines.join("\n");
  const lower = blob.toLowerCase();
  const compactNoSpace = lower.replace(/\s+/g, "");

  const headTravail = /^travail\b/i.test(headRaw);
  const headVacances = /^vacances\b/i.test(headRaw);
  const headAbsenceTravail = /^absencetravail$/i.test(
    headRaw.replace(/\s+/g, "")
  );
  const headAbsenceOnly =
    /^absence\b/i.test(headRaw) && !/^absencetravail/i.test(compactHead);

  const bodyHasTravail = /\btravail\b/i.test(lower);
  const bodyHasVacances = /\bvacances\b/i.test(lower);
  const bodyHasAbsenceTravail = /absencetravail/i.test(compactNoSpace);
  const bodyHasAbsenceWord =
    /\babsence\b/i.test(lower) && !/absencetravail/i.test(compactNoSpace);

  const pickWorkTimes = () => {
    let expectedStart: string | undefined;
    let expectedEnd: string | undefined;
    for (const line of cellLines) {
      const tm = TIME_RANGE_RE.exec(stripScheduleCellLine(line));
      if (tm) {
        expectedStart = padTime(tm[1]);
        expectedEnd = padTime(tm[2]);
        break;
      }
    }
    return { expectedStart, expectedEnd };
  };

  if (headTravail || (bodyHasTravail && !headAbsenceTravail)) {
    const { expectedStart, expectedEnd } = pickWorkTimes();
    return { kind: "work", expectedStart, expectedEnd };
  }
  if (headVacances || bodyHasVacances) return { kind: "vacation" };
  if (headAbsenceTravail || bodyHasAbsenceTravail) return { kind: "absence" };
  if (headAbsenceOnly || bodyHasAbsenceWord) return { kind: "absence" };
  return { kind: "unknown" };
}

/** Deux cellules « Travail » identiques d’affilée = souvent 2 groupes le même jour (remplaçante). */
function isDuplicateReplacanteWorkCell(
  roleLabel: string,
  previous: ParsedScheduleDay | undefined,
  day: Omit<ParsedScheduleDay, "dayIndex" | "workDate">
): boolean {
  if (!/^Remplaçante$/i.test(roleLabel.trim())) return false;
  if (!previous || previous.kind !== "work" || day.kind !== "work") return false;
  return (
    previous.expectedStart === day.expectedStart &&
    previous.expectedEnd === day.expectedEnd
  );
}

function parseDaySlot(lines: string[], startIdx: number): {
  day: Omit<ParsedScheduleDay, "dayIndex" | "workDate">;
  nextIdx: number;
  embeddedSubstituteNames: string[];
} {
  const embeddedSubstituteNames: string[] = [];

  if (startIdx >= lines.length) {
    return {
      day: { kind: "unknown" },
      nextIdx: startIdx,
      embeddedSubstituteNames,
    };
  }

  const { cell, nextIdx } = collectScheduleDayCell(lines, startIdx);
  embeddedSubstituteNames.push(...extractSubstituteNamesFromDayLines(cell));
  const day = classifyDayCellByKeywords(cell);

  return { day, nextIdx, embeddedSubstituteNames };
}

/** Après un saut de page, le PDF répète « Période du… » puis la suite des employés (ex. Souhir). */
function buildSchedulePdfEmployeeBody(fullText: string, periodStart: string, periodEnd: string): string {
  const firstPeriodIdx = fullText.search(/Période du/i);
  const prelude =
    firstPeriodIdx > 0 ? fullText.slice(0, firstPeriodIdx).trim() : "";

  const fragments: string[] = [];
  const periodLineRe =
    /Période du\s+(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/gi;
  let m: RegExpExecArray | null;
  while ((m = periodLineRe.exec(fullText)) !== null) {
    const s = m[1]!;
    const e = m[2]!;
    if (s !== periodStart || e !== periodEnd) continue;

    const afterPeriod = fullText.slice(m.index + m[0].length);
    const nextIdx = afterPeriod.search(/\n\s*Période du/i);
    const chunk = (nextIdx >= 0 ? afterPeriod.slice(0, nextIdx) : afterPeriod).trim();

    const lines = chunk
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    let i = 0;
    while (i < lines.length && /^Horaires$/i.test(lines[i]!)) i++;
    while (i < lines.length && /Lundi\s+le/i.test(lines[i]!.replace(/\s+/g, " "))) i++;
    while (i < lines.length && /^Page\s*:/i.test(lines[i]!)) i++;
    const rest = lines.slice(i).join("\n").trim();
    if (rest) fragments.push(rest);
  }

  return [prelude, ...fragments].filter(Boolean).join("\n\n");
}

function nameTokenKey(pdfName: string): string {
  const parts = normAscii(pdfName)
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length > 1);
  return Array.from(new Set(parts)).sort().join(" ");
}

function timeToMin(t?: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? "").trim());
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Préfère travail avec plage, sinon absence/vacances, plutôt que « inconnu ». */
function dayMergePreference(d: ParsedScheduleDay): number {
  if (d.kind === "work" && d.expectedStart && d.expectedEnd) {
    return 10000 + (timeToMin(d.expectedEnd) - timeToMin(d.expectedStart));
  }
  if (d.kind === "work") return 5000;
  if (d.kind === "absence" || d.kind === "vacation") return 1000;
  if (d.kind === "unknown") return 0;
  return 100;
}

function mergeParsedEmployees(employees: ParsedScheduleEmployee[]): ParsedScheduleEmployee[] {
  const byTok = new Map<
    string,
    { roleLabel: string; pdfName: string; days: ParsedScheduleDay[] }
  >();

  const workDaysCount = (days: ParsedScheduleDay[]) =>
    days.filter((d) => d.kind === "work").length;

  for (const emp of employees) {
    const tok = nameTokenKey(emp.pdfName);
    if (!tok) continue;
    const cur = byTok.get(tok);
    if (!cur) {
      byTok.set(tok, {
        roleLabel: emp.roleLabel,
        pdfName: emp.pdfName,
        days: emp.days.map((d) => ({ ...d })),
      });
      continue;
    }

    if (workDaysCount(emp.days) > workDaysCount(cur.days)) {
      cur.pdfName = emp.pdfName;
      cur.roleLabel = emp.roleLabel;
    }

    for (let i = 0; i < emp.days.length; i++) {
      const a = cur.days[i]!;
      const b = emp.days[i]!;
      if (dayMergePreference(b) > dayMergePreference(a)) {
        cur.days[i] = { ...b };
      }
    }
  }

  return Array.from(byTok.values()).map((v) => ({
    pdfName: v.pdfName,
    roleLabel: v.roleLabel,
    days: v.days,
  }));
}

export function parseEmployeeSchedulePdfText(text: string): ParsedWeeklySchedule | null {
  const periodM = PERIOD_RE.exec(text);
  if (!periodM) return null;

  const periodStart = periodM[1]!;
  const periodEnd = periodM[2]!;
  PERIOD_RE.lastIndex = 0;

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

  const body = buildSchedulePdfEmployeeBody(text, periodStart, periodEnd);
  const lines = injectShaimaMissingRoleLine(
    splitGluedDayHeadLines(
      normalizeSchedulePdfBodyLines(
        body
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      )
    )
  );

  const employees: ParsedScheduleEmployee[] = [];

  let j = 0;
  while (j < lines.length) {
    if (!ROLE_LINE.test(lines[j]!)) {
      j++;
      continue;
    }

    const roleLabel = lines[j]!;

    const nameParts: string[] = [];
    let k = j - 1;
    while (
      k >= 0 &&
      nameParts.length < 3 &&
      isScheduleEmployeeNameLine(lines[k]!)
    ) {
      nameParts.unshift(lines[k]!.trim());
      k--;
    }
    if (nameParts.length === 0) {
      j++;
      continue;
    }

    const pdfName = nameParts.join(" ");

    let nextRoleIdx = lines.length;
    for (let n = j + 1; n < lines.length; n++) {
      if (ROLE_LINE.test(lines[n]!)) {
        nextRoleIdx = n;
        break;
      }
    }

    let nextEmployeeIdx = lines.length;
    for (let n = j + 1; n < lines.length - 1; n++) {
      if (isEmployeeNameThenRoleLine(lines, n)) {
        nextEmployeeIdx = n;
        break;
      }
    }

    const block = lines.slice(j + 1, Math.min(nextRoleIdx, nextEmployeeIdx));

    const days: ParsedScheduleDay[] = [];
    const embeddedByDay: string[][] = [];
    let i = 0;
    /** Sous-titres PDF (ex. « Horaire de Shaimaa ») ou répétition du nom avant la 1ʳᵉ case jour. */
    while (i < block.length && !isScheduleDayCellHeaderLine(block[i]!)) {
      const L = stripScheduleCellLine(block[i]!);
      if (/^horaire de\b/i.test(L)) {
        i++;
        continue;
      }
      if (isScheduleEmployeeNameLine(L)) {
        i++;
        continue;
      }
      break;
    }
    for (let d = 0; d < workDates.length; d++) {
      if (i < block.length && !isScheduleDayCellHeaderLine(block[i]!)) {
        for (let d2 = d; d2 < workDates.length; d2++) {
          days.push({
            dayIndex: d2,
            workDate: workDates[d2]!,
            kind: "unknown",
          });
        }
        break;
      }
      const { day, nextIdx, embeddedSubstituteNames } = parseDaySlot(block, i);
      i = nextIdx;
      embeddedByDay[d] = embeddedSubstituteNames;
      const previous = days[days.length - 1];
      if (isDuplicateReplacanteWorkCell(roleLabel, previous, day)) {
        days.push({
          dayIndex: d,
          workDate: workDates[d]!,
          kind: "unknown",
        });
        continue;
      }
      days.push({
        dayIndex: d,
        workDate: workDates[d]!,
        ...day,
      });
    }

    employees.push({ pdfName, roleLabel, days });

    const mainNorm = normAscii(pdfName).replace(/\s+/g, " ");
    for (let d = 0; d < workDates.length; d++) {
      for (const sub of embeddedByDay[d] ?? []) {
        const subNorm = normAscii(sub).replace(/\s+/g, " ");
        if (!subNorm || subNorm === mainNorm) continue;
        const slot = days[d]!;
        if (slot.kind !== "work") continue;
        employees.push({
          pdfName: sub,
          roleLabel,
          days: workDates.map((wd, idx) =>
            idx === d
              ? {
                  dayIndex: idx,
                  workDate: wd,
                  kind: slot.kind,
                  expectedStart: slot.expectedStart,
                  expectedEnd: slot.expectedEnd,
                }
              : {
                  dayIndex: idx,
                  workDate: wd,
                  kind: "unknown" as ScheduleDayKind,
                }
          ),
        });
      }
    }

    j = nextRoleIdx;
  }

  return {
    periodStart,
    periodEnd,
    workDates,
    employees: mergeParsedEmployees(employees),
  };
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
