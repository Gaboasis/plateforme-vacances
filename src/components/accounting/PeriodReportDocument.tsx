"use client";

import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Printer, X } from "lucide-react";
import type { PeriodReport } from "@/lib/accounting-period-report";
import { formatCad } from "@/lib/money";

type Props = {
  report: PeriodReport;
  onClose: () => void;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportDocumentHtml(report: PeriodReport, bodyInner: string): string {
  const title = `Rapport comptable ${report.from} — ${report.to}`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; margin: 24px; font-size: 13px; }
    h1 { font-size: 1.35rem; margin: 0 0 4px; }
    .meta { color: #64748b; margin-bottom: 24px; }
    h2 { font-size: 1rem; margin: 28px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; background: #f8fafc; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .net { margin-top: 20px; padding: 16px; background: #f1f5f9; border-radius: 8px; text-align: center; }
    .net strong { font-size: 1.5rem; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
${bodyInner}
</body>
</html>`;
}

function ReportTable({
  headers,
  rows,
  foot,
}: {
  headers: { label: string; align?: "left" | "right" }[];
  rows: (string | number)[][];
  foot?: (string | number)[];
}) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h.label} className={h.align === "right" ? "num" : undefined}>
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td
                key={j}
                className={headers[j]?.align === "right" ? "num" : undefined}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr>
            {foot.map((cell, j) => (
              <td key={j} className={headers[j]?.align === "right" ? "num" : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

export function PeriodReportDocument({ report, onClose }: Props) {
  const periodLabel = `${format(parseISO(report.from), "d MMMM yyyy", { locale: fr })} — ${format(parseISO(report.to), "d MMMM yyyy", { locale: fr })}`;

  const payroll = report.educatorPayroll ?? [];

  const payrollRows =
    payroll.length > 0
      ? payroll.map((e) => [
    e.educatorName,
    e.totalHours > 0 ? e.totalHours.toLocaleString("fr-CA") : "—",
    formatCad(e.totalGrossCents),
    `${e.vacationIndemnityPercent} %`,
    formatCad(e.vacationIndemnityCents),
    formatCad(e.sickLeaveIndemnityCents),
    formatCad(e.employerCotisationCents),
    formatCad(e.holidayIndemnityCents),
  ])
      : [["Aucune heure saisie pour cette période", "—", "—", "—", "—", "—", "—", "—"]];

  const revenueItems = report.revenueLineItems ?? [];
  const journalExpItems = report.journalExpenseItems ?? [];

  const payrollFoot =
    payroll.length > 0
      ? [
          "Total",
          "",
          formatCad(report.expenses.educatorGrossCents),
          "",
          formatCad(report.expenses.vacationIndemnityCents),
          formatCad(report.expenses.sickLeaveIndemnityCents),
          formatCad(report.expenses.employerCotisationCents),
          formatCad(report.expenses.statutoryHolidayCents),
        ]
      : undefined;

  const revenueRows =
    revenueItems.length > 0
      ? revenueItems.map((r) => [r.label, formatCad(r.amountCents)])
      : [["Aucun revenu saisi", "—"]];

  const fixedRows =
    report.fixedExpenses.length > 0
      ? report.fixedExpenses.map((f) => [
          f.label,
          formatCad(f.amountCents),
          f.sourceName ?? "—",
          f.note ?? "—",
        ])
      : [["—", "—", "—", "Aucune dépense fixe"]];

  const journalExpRows =
    journalExpItems.length > 0
      ? journalExpItems.map((e) => [
          e.journalDate
            ? format(parseISO(e.journalDate), "d MMM yyyy", { locale: fr })
            : "—",
          e.label,
          formatCad(e.amountCents),
        ])
      : [["—", "Aucune autre dépense au journal", "—"]];

  const expenseSummaryRows: (string | number)[][] = [
    ["Salaires bruts (éducatrices)", formatCad(report.expenses.educatorGrossCents)],
    ["Cotisations employeur (QC)", formatCad(report.expenses.employerCotisationCents)],
    ["Indemnités vacances", formatCad(report.expenses.vacationIndemnityCents)],
    ["Provision maladie (0,8 %)", formatCad(report.expenses.sickLeaveIndemnityCents)],
    ["Indemnités jours fériés", formatCad(report.expenses.statutoryHolidayCents)],
    ["Autres dépenses (journal)", formatCad(report.expenses.otherDailyCents)],
    ["Dépenses fixes", formatCad(report.expenses.fixedExpensesCents)],
  ];

  const openPrintWindow = () => {
    const root = document.getElementById("period-report-document-body");
    if (!root) return;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    w.document.write(reportDocumentHtml(report, root.innerHTML));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-900/50"
      role="dialog"
      aria-modal
      aria-labelledby="period-report-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
        <p className="font-semibold text-slate-800 truncate" id="period-report-title">
          Rapport comptable — {periodLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={openPrintWindow}>
            <Printer className="h-4 w-4" />
            Imprimer / PDF
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Fermer
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-100 p-4 print:bg-white print:p-0">
        <div
          id="period-report-document-body"
          className="mx-auto max-w-4xl bg-white rounded-xl shadow-sm p-6 sm:p-8 print:shadow-none print:max-w-none"
        >
          <h1 className="text-xl font-bold text-slate-900">Rapport comptable — Garderie</h1>
          <p className="text-slate-600 mt-1 meta">{periodLabel}</p>
          <p className="text-sm text-slate-500">
            {report.daysWithJournal} jour(s) saisi(s) dans le journal ·{" "}
            {report.statutoryHolidayDates.length} jour(s) férié(s) comptabilisé(s)
          </p>

          <h2 className="text-base font-semibold mt-8 border-b border-slate-200 pb-1">
            1 — Budget global (synthèse)
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-sm font-medium text-emerald-800 mb-2">Revenus</p>
              <ReportTable
                headers={[
                  { label: "Poste" },
                  { label: "Montant", align: "right" },
                ]}
                rows={revenueRows}
                foot={["Total revenus", formatCad(report.revenue.totalCents)]}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-rose-800 mb-2">Dépenses</p>
              <ReportTable
                headers={[
                  { label: "Poste" },
                  { label: "Montant", align: "right" },
                ]}
                rows={expenseSummaryRows}
                foot={["Total dépenses", formatCad(report.expenses.totalCents)]}
              />
            </div>
          </div>
          <div className="net mt-6 rounded-xl bg-slate-100 p-4 text-center">
            <p className="text-sm text-slate-600">Résultat net</p>
            <p
              className={`text-2xl font-bold ${
                report.netCents >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {formatCad(report.netCents)}
            </p>
          </div>

          <h2 className="text-base font-semibold mt-8 border-b border-slate-200 pb-1">
            2 — Salaires et charges par employée
          </h2>
          <div className="overflow-x-auto mt-3">
            <ReportTable
              headers={[
                { label: "Employée" },
                { label: "Heures", align: "right" },
                { label: "Salaire brut", align: "right" },
                { label: "Vac." },
                { label: "Indem. vacances", align: "right" },
                { label: "Maladie 0,8 %", align: "right" },
                { label: "Cotis. employeur", align: "right" },
                { label: "Fériés", align: "right" },
              ]}
              rows={payrollRows}
              foot={payrollFoot}
            />
          </div>

          <h2 className="text-base font-semibold mt-8 border-b border-slate-200 pb-1">
            3 — Revenus détaillés
          </h2>
          <div className="mt-3">
            <ReportTable
              headers={[
                { label: "Description" },
                { label: "Montant ($)", align: "right" },
              ]}
              rows={revenueRows}
              foot={["Total", formatCad(report.revenue.totalCents)]}
            />
          </div>

          <h2 className="text-base font-semibold mt-8 border-b border-slate-200 pb-1">
            4 — Autres dépenses (journal)
          </h2>
          <div className="mt-3">
            <ReportTable
              headers={[
                { label: "Date" },
                { label: "Description" },
                { label: "Montant ($)", align: "right" },
              ]}
              rows={journalExpRows}
              foot={[
                "Total",
                "",
                formatCad(report.expenses.otherDailyCents),
              ]}
            />
          </div>

          <h2 className="text-base font-semibold mt-8 border-b border-slate-200 pb-1">
            5 — Dépenses fixes
          </h2>
          <div className="mt-3">
            <ReportTable
              headers={[
                { label: "Dépense" },
                { label: "Montant ($)", align: "right" },
                { label: "Responsable" },
                { label: "Note" },
              ]}
              rows={fixedRows}
              foot={[
                "Total",
                formatCad(report.expenses.fixedExpensesCents),
                "",
                "",
              ]}
            />
          </div>

          {report.holidayIndemnityLines.length > 0 && (
            <>
              <h2 className="text-base font-semibold mt-8 border-b border-slate-200 pb-1">
                6 — Détail jours fériés (Québec)
              </h2>
              <div className="overflow-x-auto mt-3">
                <ReportTable
                  headers={[
                    { label: "Employée" },
                    { label: "Date férié" },
                    { label: "Salaire ref. (4 sem.)", align: "right" },
                    { label: "Période ref." },
                    { label: "Indemnité", align: "right" },
                  ]}
                  rows={report.holidayIndemnityLines.map((h) => [
                    h.educatorName,
                    format(parseISO(h.holidayDate), "d MMM yyyy", { locale: fr }),
                    formatCad(h.referenceGrossCents),
                    `${h.referenceFrom} → ${h.referenceTo}`,
                    formatCad(h.indemnityCents),
                  ])}
                  foot={[
                    "Total",
                    "",
                    "",
                    "",
                    formatCad(report.expenses.statutoryHolidayCents),
                  ]}
                />
              </div>
            </>
          )}

          <p className="text-xs text-slate-400 mt-10">
            Généré depuis la plateforme — {format(new Date(), "d MMM yyyy HH:mm", { locale: fr })}
          </p>
        </div>
      </div>
    </div>
  );
}
