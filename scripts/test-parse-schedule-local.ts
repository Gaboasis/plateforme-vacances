import fs from "fs";
import pdf from "pdf-parse";
import { parseEmployeeSchedulePdfText } from "../src/lib/parse-employee-schedule-pdf";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/test-parse-schedule-local.ts <chemin.pdf>");
    process.exit(1);
  }
  const buf = fs.readFileSync(path);
  const { text } = await pdf(buf);
  const snippet = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const shaimaIdx = snippet.findIndex((l) => /shaimaa|mohamed hosny/i.test(l));
  console.log("--- Contexte texte brut (Shaimaa)");
  for (
    let i = Math.max(0, shaimaIdx - 5);
    i < Math.min(snippet.length, shaimaIdx + 45);
    i++
  ) {
    console.log(`${String(i).padStart(4)}| ${snippet[i]}`);
  }

  const parsed = parseEmployeeSchedulePdfText(text);
  if (!parsed) {
    console.error("parseEmployeeSchedulePdfText → null");
    process.exit(1);
  }
  console.log("--- Dates semaine", parsed.workDates);
  const targets = parsed.employees.filter((e) =>
    /shaimaa|mohamed|hosny/i.test(e.pdfName)
  );
  console.log(
    JSON.stringify(
      targets.map((e) => ({
        pdfName: e.pdfName,
        role: e.roleLabel,
        days: e.days.map((d) => ({
          date: d.workDate,
          kind: d.kind,
          start: d.expectedStart,
          end: d.expectedEnd,
        })),
      })),
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
