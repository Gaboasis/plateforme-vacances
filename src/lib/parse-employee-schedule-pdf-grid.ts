/**
 * Lecture du PDF horaire comme un tableau : colonne 1 = noms, colonnes 2–6 = lun–ven.
 * Chaque case : Travail → heures dans la case ; Absence / Vacances → pas de travail (heures ignorées).
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  ParsedScheduleDay,
  ParsedScheduleEmployee,
  ParsedWeeklySchedule,
  ScheduleDayKind,
} from "./parse-employee-schedule-pdf";
import {
  DAY_HEADER_RE,
  ROLE_LINE,
  TIME_RANGE_RE,
  classifyDayCellByKeywords,
  mergeParsedEmployees,
  parseWorkDates,
  stripScheduleCellLine,
} from "./parse-employee-schedule-pdf";

type PdfTextItem = {
  page: number;
  x: number;
  y: number;
  str: string;
};

const DAY_HEAD_CELL_RE =
  /^(Travail|Absence|Vacances|AbsenceTravail)$/i;

const ROLE_SKIP_RE =
  /^(Éducatrice|qualifiée|non|Cuisinière|Remplaçante|Préposée|Secrétaire|Horaire de\b)/i;

const COL_TOL = 22;
const MIN_HEADS_PER_COL = 4;

function normHead(s: string): string {
  return stripScheduleCellLine(s).replace(/\s+/g, "");
}

function isDayHead(str: string): boolean {
  return DAY_HEAD_CELL_RE.test(normHead(str));
}

/** Regroupe les X des en-têtes « Travail / Absence / … » en 5 colonnes jour. */
function detectDayColumnXs(items: PdfTextItem[]): number[] | null {
  const xs: number[] = [];
  for (const it of items) {
    if (!isDayHead(it.str)) continue;
    xs.push(it.x);
  }
  if (xs.length < MIN_HEADS_PER_COL * 3) return null;

  const sorted = [...xs].sort((a, b) => a - b);
  const groups: { center: number; count: number }[] = [];
  for (const x of sorted) {
    const g = groups.find((gr) => Math.abs(gr.center - x) <= COL_TOL);
    if (g) {
      g.count++;
      g.center = (g.center * (g.count - 1) + x) / g.count;
    } else {
      groups.push({ center: x, count: 1 });
    }
  }

  const major = groups
    .filter((g) => g.count >= MIN_HEADS_PER_COL)
    .sort((a, b) => a.center - b.center);

  if (major.length < 5) return null;
  return major.slice(0, 5).map((g) => g.center);
}

function columnBounds(cols: number[]): { left: number; right: number }[] {
  const sorted = [...cols].sort((a, b) => a - b);
  const bounds: { left: number; right: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const left =
      i === 0
        ? sorted[0]! - 80
        : (sorted[i - 1]! + sorted[i]!) / 2;
    const right =
      i === sorted.length - 1
        ? sorted[i]! + 120
        : (sorted[i]! + sorted[i + 1]!) / 2;
    bounds.push({ left, right });
  }
  return bounds;
}

function columnIndex(x: number, cols: number[]): number {
  const bounds = columnBounds(cols);
  for (let i = 0; i < bounds.length; i++) {
    const b = bounds[i]!;
    if (x >= b.left && x < b.right) return i;
  }
  for (let i = 0; i < cols.length; i++) {
    if (Math.abs(x - cols[i]!) <= COL_TOL) return i;
  }
  return -1;
}

function pdfFullText(items: PdfTextItem[]): string {
  return items
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((it) => it.str)
    .join(" ");
}

const GRID_PERIOD_RE =
  /Période du (\d{4}-\d{2}-\d{2}) au (\d{4}-\d{2}-\d{2})/i;

function parsePeriodAndDates(
  fullText: string
): { periodStart: string; periodEnd: string; workDates: string[] } | null {
  const periodM = GRID_PERIOD_RE.exec(fullText);
  if (!periodM) return null;
  const periodStart = periodM[1]!;
  const periodEnd = periodM[2]!;

  const headerM = DAY_HEADER_RE.exec(fullText.replace(/\s+/g, " "));
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

  return { periodStart, periodEnd, workDates };
}

function workTimesFromLines(
  cellLines: string[]
): { expectedStart?: string; expectedEnd?: string } {
  for (const line of cellLines) {
    const tm = TIME_RANGE_RE.exec(stripScheduleCellLine(line));
    if (tm) {
      return {
        expectedStart: padTime(tm[1]!),
        expectedEnd: padTime(tm[2]!),
      };
    }
  }
  const joined = cellLines.join(" ");
  const tm = TIME_RANGE_RE.exec(joined);
  if (tm) {
    return {
      expectedStart: padTime(tm[1]!),
      expectedEnd: padTime(tm[2]!),
    };
  }
  const times = cellLines
    .map((l) => /^\d{1,2}:\d{2}$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m != null)
    .map((m) => padTime(m[1]! + ":" + m[2]!));
  if (times.length >= 2) {
    return { expectedStart: times[0], expectedEnd: times[times.length - 1] };
  }
  return {};
}

function padTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  return `${String(parseInt(m[1]!, 10)).padStart(2, "0")}:${m[2]!}`;
}

function classifyHeadWord(
  head: string,
  cellLines: string[]
): Omit<ParsedScheduleDay, "dayIndex" | "workDate"> {
  const compact = normHead(head);
  if (/^vacances$/i.test(compact)) return { kind: "vacation" };
  if (/^absence$/i.test(compact) || /^absencetravail$/i.test(compact)) {
    return { kind: "absence" };
  }
  if (/^travail$/i.test(compact)) {
    return { kind: "work", ...workTimesFromLines(cellLines) };
  }
  return classifyDayCellByKeywords([head, ...cellLines]);
}

function consolidatePdfName(parts: string[]): string {
  if (parts.length === 0) return "";
  const sorted = [...parts].sort((a, b) => b.length - a.length);
  const primary = sorted[0]!;
  const extra = sorted
    .slice(1)
    .filter((p) => !primary.toLowerCase().includes(p.toLowerCase()));
  return [primary, ...extra].join(" ").trim();
}

function nameColumnParts(
  items: PdfTextItem[],
  yTop: number,
  yBottom: number
): string[] {
  const rawNameItems = items.filter(
    (it) =>
      it.x < 112 &&
      it.y >= yTop - 6 &&
      it.y <= yTop + 2 &&
      it.str.length > 0 &&
      !ROLE_SKIP_RE.test(it.str) &&
      !TIME_RANGE_RE.test(it.str) &&
      !/^\d{1,2}:\d{2}$/.test(it.str) &&
      !isDayHead(it.str)
  );
  const nameYs = Array.from(new Set(rawNameItems.map((it) => Math.round(it.y)))).sort(
    (a, b) => b - a
  );
  const parts: string[] = [];
  for (const yKey of nameYs) {
    const lineParts = rawNameItems
      .filter((it) => Math.round(it.y) === yKey)
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str.trim());
    if (lineParts.length) parts.push(lineParts.join(" "));
  }
  const namePartStrings = parts
    .filter((s) => s.length >= 2);

  const out: string[] = [];
  for (const p of namePartStrings) {
    if (/^horaire de\b/i.test(p)) continue;
    if (ROLE_LINE.test(p)) continue;
    out.push(p);
  }
  return out;
}

function roleLabelInBand(
  items: PdfTextItem[],
  yTop: number,
  yBottom: number
): string {
  const lines = items
    .filter((it) => it.x < 112 && it.y >= yTop - 22 && it.y <= yTop + 4)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((it) => it.str.trim());

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]!;
    if (ROLE_LINE.test(L)) return L;
    if (/^Éducatrice$/i.test(L) && /^qualifiée$/i.test(lines[i + 1] ?? "")) {
      return "Éducatrice qualifiée";
    }
    if (
      /^Éducatrice$/i.test(L) &&
      /^non$/i.test(lines[i + 1] ?? "") &&
      /^qualifiée$/i.test(lines[i + 2] ?? "")
    ) {
      return "Éducatrice non qualifiée";
    }
  }
  return "";
}

function cellLinesForColumn(
  items: PdfTextItem[],
  col: number,
  cols: number[],
  yTop: number,
  yBottom: number
): string[] {
  return items
    .filter((it) => {
      if (columnIndex(it.x, cols) !== col) return false;
      /* Ne rien prendre au-dessus de l’en-tête jour (ligne employé du dessus). */
      return it.y > yBottom && it.y <= yTop + 1;
    })
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((it) => it.str)
    .filter(Boolean);
}

async function loadPdfTextItems(buffer: Buffer): Promise<PdfTextItem[]> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const out: PdfTextItem[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const tc = await page.getTextContent();
    for (const raw of tc.items) {
      if (!("str" in raw) || !String(raw.str).trim()) continue;
      const t = raw.transform;
      out.push({
        page: pageNum,
        x: t[4] as number,
        y: t[5] as number,
        str: String(raw.str).trim(),
      });
    }
  }
  return out;
}

type RowAnchor = { page: number; y: number; col0Head: string };

function findEmployeeRows(
  items: PdfTextItem[],
  cols: number[]
): RowAnchor[] {
  const rows: RowAnchor[] = [];
  const byPage = new Map<number, PdfTextItem[]>();
  for (const it of items) {
    if (!byPage.has(it.page)) byPage.set(it.page, []);
    byPage.get(it.page)!.push(it);
  }

  for (const [page, pageItems] of Array.from(byPage.entries())) {
    const heads = pageItems.filter(
      (it) =>
        Math.abs(it.x - cols[0]!) <= COL_TOL && isDayHead(it.str)
    );
    const yValues = Array.from(
      new Set(heads.map((h) => Math.round(h.y)))
    ).sort((a, b) => b - a);
    for (const yKey of yValues) {
      const head = heads.find((h) => Math.round(h.y) === yKey);
      if (!head) continue;
      rows.push({ page, y: head.y, col0Head: head.str });
    }
  }

  rows.sort((a, b) => b.y - a.y || a.page - b.page);
  return rows;
}

function rowBounds(
  rows: RowAnchor[],
  index: number
): { yTop: number; yBottom: number; page: number } {
  const cur = rows[index]!;
  const samePage = rows.filter((r) => r.page === cur.page);
  const pos = samePage.findIndex((r) => r.y === cur.y);
  const below = samePage[pos + 1];
  const yBottom = below ? below.y + 1 : 0;
  return { yTop: cur.y, yBottom, page: cur.page };
}

export async function parseEmployeeSchedulePdfGrid(
  buffer: Buffer,
  textHint?: string
): Promise<ParsedWeeklySchedule | null> {
  const items = await loadPdfTextItems(buffer);
  if (items.length === 0) return null;

  const cols = detectDayColumnXs(items);
  if (!cols) return null;

  const fullText = pdfFullText(items);
  let meta = parsePeriodAndDates(fullText);
  if (!meta && textHint?.trim()) {
    meta = parsePeriodAndDates(textHint);
  }
  if (!meta) return null;

  const { periodStart, periodEnd, workDates } = meta;
  const rows = findEmployeeRows(items, cols);
  const employees: ParsedScheduleEmployee[] = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const { yTop, yBottom, page } = rowBounds(rows, ri);
    const pageItems = items.filter((it) => it.page === page);

    const nameParts = nameColumnParts(pageItems, yTop, yBottom);
    if (nameParts.length === 0) continue;
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const p of nameParts) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(p);
    }
    const pdfName = consolidatePdfName(deduped);
    let roleLabel = roleLabelInBand(pageItems, yTop, yBottom);
    const horaireDeHint = pageItems.some(
      (it) =>
        it.x < 112 &&
        it.y >= yTop - 20 &&
        it.y <= yTop + 6 &&
        /^horaire de\b/i.test(it.str)
    );
    if (!roleLabel && (horaireDeHint || /shaimaa/i.test(pdfName))) {
      roleLabel = "Éducatrice qualifiée";
    }
    if (!roleLabel) continue;

    const days: ParsedScheduleDay[] = [];

    for (let d = 0; d < workDates.length && d < cols.length; d++) {
      const headItem = pageItems.find(
        (it) =>
          columnIndex(it.x, cols) === d &&
          Math.abs(it.y - yTop) <= 4 &&
          isDayHead(it.str)
      );
      const lines = cellLinesForColumn(pageItems, d, cols, yTop, yBottom);
      const head = headItem?.str ?? lines.find((l) => isDayHead(l)) ?? "";
      const bodyLines = lines.filter((l) => l !== head && !isDayHead(l));
      const dayFields = head
        ? classifyHeadWord(head, bodyLines)
        : classifyDayCellByKeywords(lines.length ? lines : ["unknown"]);

      days.push({
        dayIndex: d,
        workDate: workDates[d]!,
        ...dayFields,
      });
    }

    while (days.length < workDates.length) {
      const d = days.length;
      days.push({
        dayIndex: d,
        workDate: workDates[d]!,
        kind: "unknown" satisfies ScheduleDayKind,
      });
    }

    employees.push({ pdfName, roleLabel, days });
  }

  if (employees.length === 0) return null;

  return {
    periodStart,
    periodEnd,
    workDates,
    employees: mergeParsedEmployees(employees),
  };
}

export async function parseEmployeeSchedulePdfBuffer(
  buffer: Buffer,
  textFallback?: string
): Promise<ParsedWeeklySchedule | null> {
  try {
    const grid = await parseEmployeeSchedulePdfGrid(buffer, textFallback);
    if (grid && grid.employees.length > 0) return grid;
  } catch {
    /* pdfjs indisponible ou PDF atypique */
  }

  const { parseEmployeeSchedulePdfText } = await import(
    "./parse-employee-schedule-pdf"
  );
  if (textFallback?.trim()) {
    return parseEmployeeSchedulePdfText(textFallback);
  }
  try {
    const pdf = (await import("pdf-parse")).default;
    const parsed = await pdf(buffer);
    const text = parsed.text?.trim();
    if (text) return parseEmployeeSchedulePdfText(text);
  } catch {
    /* ignore */
  }
  return null;
}
