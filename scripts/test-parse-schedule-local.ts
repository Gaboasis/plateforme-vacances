import fs from "fs";
import pdf from "pdf-parse";
import { parseEmployeeSchedulePdfBuffer } from "../src/lib/parse-employee-schedule-pdf-grid";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/test-parse-schedule-local.ts <chemin.pdf>");
    process.exit(1);
  }
  const buf = fs.readFileSync(path);
  const { text } = await pdf(buf);

  const parsed = await parseEmployeeSchedulePdfBuffer(buf, text);
  if (!parsed) {
    console.error("parse → null");
    process.exit(1);
  }
  console.log("--- Dates semaine", parsed.workDates);

  const show = (re: RegExp) => {
    const targets = parsed.employees.filter((e) => re.test(e.pdfName));
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
  };

  show(/rana|ghazzawi/i);
  show(/shaimaa|mohamed hosny/i);
  show(/khira|hemiss/i);
  console.log(
    "unknown count",
    parsed.employees.reduce(
      (n, e) => n + e.days.filter((d) => d.kind === "unknown").length,
      0
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
