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

/** Prénoms / variantes du PDF → prénom plateforme (minuscule). */
const PDF_NAME_ALIASES: Record<string, string> = {
  amneh: "amineh",
  aysha: "aicha",
  zoukaa: "zooka",
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

export function parsePresencePdfText(text: string): PresencePdfRow[] {
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

    const startTime = m[3].padStart(5, "0");
    const endTime = m[4].padStart(5, "0");
    rows.push({
      pdfName: m[1].trim(),
      journalDate: m[2],
      startTime,
      endTime,
      site: m[5],
      hours: hoursBetweenTimes(startTime, endTime),
    });
  }
  return rows;
}

function platformFirstName(platformName: string): string {
  return normalizeToken(platformName);
}

function tokensFromPdfName(pdfName: string): string[] {
  return pdfName
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

export function matchPdfNameToEducator(
  pdfName: string,
  educators: { id: string; name: string }[]
): { id: string; name: string } | null {
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
