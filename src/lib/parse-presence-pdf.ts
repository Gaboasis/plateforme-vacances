/** Parse « Historique des présences » (GAB / Boutchoux). */

export type PresencePdfRow = {
  pdfName: string;
  journalDate: string;
  startTime: string;
  endTime: string;
  site: string;
  hours: number;
};

export type MatchedPresenceRow = PresencePdfRow & {
  educatorId: string;
  educatorName: string;
};

export type PresenceParseResult = {
  journalDate: string | null;
  rows: MatchedPresenceRow[];
  unmatchedPdfNames: string[];
  rawLineCount: number;
};

const ROW_RE =
  /^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+(\S+)\s*$/;

/** Une ligne compacte se termine par date + deux heures (avant le « GAB » du site). */
const ROW_COMPACT_TAIL_RE =
  /([A-Za-zÀ-ÿ-]*[a-zà-ÿ])(\d{4}-\d{2}-\d{2})(\d{2}:\d{2})(\d{2}:\d{2})$/;

const SKIP_NAME_RE =
  /imprime|educatrice|historique|garderie|^page\d|date debut|installation/i;

/** Prénoms / variantes du PDF → prénom plateforme (minuscule). */
const PDF_NAME_ALIASES: Record<string, string> = {
  amneh: "amineh",
  aysha: "aicha",
  zoukaa: "zooka",
  chaima: "shaima",
  shaima: "shaima",
};

function normalizeToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Heures entre début et fin, arrondi au quart d'heure le plus proche. */
export function hoursBetweenTimes(start: string, end: string): number {
  let diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 4) / 4;
}

function pushPresenceRow(
  rows: PresencePdfRow[],
  pdfName: string,
  journalDate: string,
  startTime: string,
  endTime: string,
  site: string
) {
  const name = pdfName.trim();
  if (!name || SKIP_NAME_RE.test(normalizeToken(name))) return;
  const start = startTime.padStart(5, "0");
  const end = endTime.padStart(5, "0");
  rows.push({
    pdfName: name,
    journalDate,
    startTime: start,
    endTime: end,
    site,
    hours: hoursBetweenTimes(start, end),
  });
}

function parsePresenceSpacedLines(text: string): PresencePdfRow[] {
  const rows: PresencePdfRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Garderie") || trimmed.startsWith("Historique")) {
      continue;
    }
    if (trimmed.startsWith("Éducatrice") || trimmed.startsWith("Imprimé")) continue;
    if (trimmed.includes("--") && trimmed.includes("of")) continue;

    const m = ROW_RE.exec(trimmed);
    if (!m) continue;
    pushPresenceRow(rows, m[1], m[2], m[3], m[4], m[5]);
  }
  return rows;
}

function presenceBodyWithoutHeader(flat: string): string {
  const afterPage = flat.match(/Page\d+(.*)/i);
  if (afterPage?.[1]) return afterPage[1];
  const afterHeader = flat.match(
    /(?:DébutFinInstallation|FinInstallation)(.*)/i
  );
  return afterHeader?.[1] ?? flat;
}

function parsePresenceCompactBlob(text: string): PresencePdfRow[] {
  const flat = text.replace(/\s+/g, "");
  const body = presenceBodyWithoutHeader(flat);
  const rows: PresencePdfRow[] = [];
  for (const chunk of body.split("GAB")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const m = ROW_COMPACT_TAIL_RE.exec(trimmed);
    if (!m) continue;
    pushPresenceRow(rows, m[1], m[2], m[3], m[4], "GAB");
  }
  return rows;
}

export function parsePresencePdfText(text: string): PresencePdfRow[] {
  const spaced = parsePresenceSpacedLines(text);
  if (spaced.length > 0) return spaced;
  return parsePresenceCompactBlob(text);
}

function platformFirstName(platformName: string): string {
  return normalizeToken(platformName);
}

/** « ElBhetouriKarima » ou « Cheikh-El-Najjarine Hanady » → jetons pour le prénom. */
function splitPdfNameParts(pdfName: string): string[] {
  const withSpaces = pdfName
    .replace(/-/g, " ")
    .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, "$1 $2")
    .replace(/([A-ZÀ-Ÿ]{2,})([A-ZÀ-Ÿ][a-zà-ÿ])/g, "$1 $2");
  return withSpaces
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function tokensFromPdfName(pdfName: string): string[] {
  const parts = splitPdfNameParts(pdfName);
  if (parts.length > 0) return parts;
  return pdfName
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

export function matchPdfNameToEducator(
  pdfName: string,
  educators: { id: string; name: string }[]
): { id: string; name: string } | null {
  const normFull = normalizeToken(pdfName).replace(/\s+/g, " ");
  if (/khir|hemiss|om el khir/.test(normFull)) {
    const khira =
      educators.find((e) => e.id === "7") ??
      educators.find((e) => platformFirstName(e.name) === "khira");
    if (khira) return khira;
  }

  const tokens = tokensFromPdfName(pdfName);
  if (tokens.length === 0) return null;

  for (const e of educators) {
    const first = platformFirstName(e.name);
    if (tokens.some((t) => t === first)) {
      return e;
    }
  }

  for (const t of tokens) {
    const alias = PDF_NAME_ALIASES[t];
    if (!alias) continue;
    const hit = educators.find((e) => platformFirstName(e.name) === alias);
    if (hit) return hit;
  }

  for (const e of educators) {
    const first = platformFirstName(e.name);
    if (tokens.some((t) => t.includes(first) || first.includes(t))) {
      if (first.length >= 4) return e;
    }
  }

  return null;
}

export function buildPresenceImport(
  text: string,
  educators: { id: string; name: string }[]
): PresenceParseResult {
  const parsed = parsePresencePdfText(text);
  const dates = Array.from(new Set(parsed.map((r) => r.journalDate)));
  const journalDate =
    dates.length === 1 ? dates[0]! : dates.length > 1 ? dates[0]! : null;

  const rows: MatchedPresenceRow[] = [];
  const unmatchedPdfNames: string[] = [];

  for (const row of parsed) {
    const edu = matchPdfNameToEducator(row.pdfName, educators);
    if (!edu) {
      unmatchedPdfNames.push(row.pdfName);
      continue;
    }
    rows.push({
      ...row,
      educatorId: edu.id,
      educatorName: edu.name,
    });
  }

  return {
    journalDate,
    rows,
    unmatchedPdfNames: Array.from(new Set(unmatchedPdfNames)),
    rawLineCount: parsed.length,
  };
}
