/** Conserve une copie du PDF dans rawPdfText (base64) si la colonne Bytes est absente en prod. */

export const SCHEDULE_PDF_B64_MARKER = "\n---SCHEDULE_PDF_B64---\n";

export function stripEmbeddedSchedulePdf(text: string): string {
  const i = text.indexOf(SCHEDULE_PDF_B64_MARKER);
  return i >= 0 ? text.slice(0, i).trim() : text.trim();
}

export function embedSchedulePdfInText(plainText: string, pdf: Buffer): string {
  const body = stripEmbeddedSchedulePdf(plainText);
  return body + SCHEDULE_PDF_B64_MARKER + pdf.toString("base64");
}

export function extractSchedulePdfBuffer(options: {
  rawPdfText?: string | null;
  rawPdfBytes?: Uint8Array | null;
}): Buffer | null {
  if (options.rawPdfBytes?.length) {
    return Buffer.from(options.rawPdfBytes);
  }
  const text = options.rawPdfText;
  if (!text) return null;
  const i = text.indexOf(SCHEDULE_PDF_B64_MARKER);
  if (i < 0) return null;
  const b64 = text.slice(i + SCHEDULE_PDF_B64_MARKER.length).replace(/\s/g, "");
  if (!b64.length) return null;
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

export function schedulePdfTextHint(rawPdfText?: string | null): string | undefined {
  if (!rawPdfText?.trim()) return undefined;
  return stripEmbeddedSchedulePdf(rawPdfText);
}
