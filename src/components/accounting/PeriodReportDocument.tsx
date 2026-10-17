"use client";

import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Printer, X } from "lucide-react";
import type { PeriodReport } from "@/lib/accounting-period-report";
import { formatCad } from "@/lib/money";

type Props = {
  report: PeriodReport;
  onClose: () => void;
  showSalaryDetails?: boolean;
};

const REPORT_STYLES = `
.period-report { color: #0f172a; font-size: 13px; line-height: 1.45; }
.period-report .report-hero { margin-bottom: 28px; }
.period-report .report-hero h1 { font-size: 1.35rem; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em; }
.period-report .report-hero .period { color: #475569; font-size: 15px; margin: 0 0 4px; }
.period-report .report-hero .meta { color: #94a3b8; font-size: 12px; margin: 0; }
.period-report .report-section { margin-top: 32px; }
.period-report .report-section-title {
  font-size: 13px; font-weight: 700; color: #334155; margin: 0 0 12px;
  padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;
  letter-spacing: 0.01em;
}
.period-report .report-section-hint {
  font-size: 11px; color: #64748b; margin: -4px 0 12px; line-height: 1.4;
}
.period-report .report-card-label {
  font-size: 12px; font-weight: 600; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.06em;
}
.period-report .report-card-label.revenue { color: #047857; }
.period-report .report-card-label.expense { color: #be123c; }
.period-report .report-summary-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
}
@media (max-width: 640px) {
  .period-report .report-summary-grid { grid-template-columns: 1fr; }
}
.period-report .report-net {
  margin-top: 24px; padding: 20px 24px; text-align: center;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0; border-radius: 12px;
}
.period-report .report-net .label { font-size: 12px; color: #64748b; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.period-report .report-net .value { font-size: 1.75rem; font-weight: 800; margin: 0; font-variant-numeric: tabular-nums; }
.period-report .report-net .value.positive { color: #047857; }
.period-report .report-net .value.negative { color: #be123c; }
.period-report .report-table-wrap {
  overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px;
  background: #fff; -webkit-overflow-scrolling: touch;
}
.period-report .report-table {
  width: 100%; min-width: 100%; border-collapse: collapse; table-layout: auto;
}
.period-report .report-table thead th {
  background: #f8fafc; padding: 10px 14px; text-align: left; vertical-align: bottom;
  font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  color: #64748b; border-bottom: 1px solid #e2e8f0; white-space: nowrap;
}
.period-report .report-table thead th.num { text-align: right; }
.period-report .report-table tbody td {
  padding: 10px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle;
  color: #1e293b;
}
.period-report .report-table tbody tr:last-child td { border-bottom: none; }
.period-report .report-table tbody tr:nth-child(even) td { background: #fafbfc; }
.period-report .report-table tbody td.num {
  text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
  font-weight: 500; color: #0f172a;
}
.period-report .report-table tbody td.muted { color: #64748b; font-size: 12px; white-space: nowrap; }
.period-report .report-table tbody td.text { max-width: 220px; word-break: break-word; }
.period-report .report-table tfoot td {
  background: #f1f5f9; font-weight: 700; padding: 12px 14px;
  border-top: 2px solid #e2e8f0; color: #0f172a;
}
.period-report .report-table tfoot td.num {
  text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.period-report .report-table--payroll { min-width: 880px; }
.period-report .report-table--payroll thead th:nth-child(1) { min-width: 100px; }
.period-report .report-table--payroll thead th.num { min-width: 88px; }
.period-report .report-table--holiday { min-width: 720px; }
.period-report .report-table--holiday thead th:nth-child(2) { min-width: 108px; }
.period-report .report-table--holiday thead th:nth-child(4) { min-width: 200px; }
.period-report .report-footer { margin-top: 40px; font-size: 11px; color: #94a3b8; }
@media print {
  .period-report .report-table-wrap { border: 1px solid #cbd5e1; break-inside: avoid; }
  .period-report .report-section { break-inside: avoid-page; }
}
`;

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
  <style>${REPORT_STYLES}
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 24px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
${bodyInner}
</body>
</html>`;
}

type ColAlign = "left" | "right";

function ReportTable({
  headers,
  rows,
  foot,
  tableClassName = "",
  cellClass,
}: {
  headers: { label: string; align?: ColAlign }[];
  rows: (string | number)[][];
  foot?: (string | number)[];
  tableClassName?: string;
  /** Optional per-column td class (e.g. num, muted, text) */
  cellClass?: (colIndex: number, rowIndex: number) => string | undefined;
}) {
  const defaultCellClass = (j: number): string | undefined => {
    if (headers[j]?.align === "right") return "num";
    return undefined;
  };

  return (
    <div className="report-table-wrap">
      <table className={`report-table ${tableClassName}`.trim()}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h.label}
                className={h.align === "right" ? "num" : undefined}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => {
                const extra =
                  cellClass?.(j, i) ?? defaultCellClass(j);
                return (
                  <td key={j} className={extra}>
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {foot.map((cell, j) => (
                <td
                  key={j}
                  className={headers[j]?.align === "right" ? "num" : undefined}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function PeriodReportDocument({
  report,
  onClose,
  showSalaryDetails = true,
}: Props) {
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

  const expenseDetailSortable: { sortKey: string; row: string[] }[] = [];

  for (const e of journalExpItems) {
    const period =
      e.accountingPeriodStart && e.accountingPeriodEnd
        ? e.accountingPeriodStart === e.accountingPeriodEnd
          ? e.accountingPeriodStart
          : `${e.accountingPeriodStart} → ${e.accountingPeriodEnd}`
        : "—";
    expenseDetailSortable.push({
      sortKey: e.journalDate ?? "",
      row: [
        "Journal",
        e.journalDate
          ? format(parseISO(e.journalDate), "d MMM yyyy", { locale: fr })
          : "—",
        e.label,
        formatCad(e.amountCents),
        period,
        e.splitGroupId && e.invoiceDate ? `${e.invoiceDate} (répartie)` : "—",
        "—",
        "—",
      ],
    });
  }

  for (const f of report.fixedExpenses) {
    const period =
      f.periodStart === f.periodEnd
        ? f.periodStart
        : `${f.periodStart} → ${f.periodEnd}`;
    const invoiceCell =
      f.invoiceDate && f.invoiceDate !== f.periodStart
        ? `${f.invoiceDate}${f.splitGroupId ? " (répartie)" : ""}`
        : "—";
    const dateDisplay = f.invoiceDate
      ? format(parseISO(f.invoiceDate), "d MMM yyyy", { locale: fr })
      : f.periodStart;
    expenseDetailSortable.push({
      sortKey: f.invoiceDate ?? f.periodStart,
      row: [
        "Fixe",
        dateDisplay,
        f.label,
        formatCad(f.amountCents),
        period,
        invoiceCell,
        f.sourceName ?? "—",
        f.note ?? "—",
      ],
    });
  }

  expenseDetailSortable.sort((a, b) => {
    const d = a.sortKey.localeCompare(b.sortKey);
    if (d !== 0) return d;
    return a.row[2]!.localeCompare(b.row[2]!, "fr");
  });

  const expenseDetailRows =
    expenseDetailSortable.length > 0
      ? expenseDetailSortable.map((x) => x.row)
      : [["—", "—", "Aucune dépense sur la période", "—", "—", "—", "—", "—"]];

  const expenseDetailTotalCents =
    report.expenses.otherDailyCents + report.expenses.fixedExpensesCents;

  const payrollTotalCents =
    report.expenses.educatorGrossCents +
    report.expenses.employerCotisationCents +
    report.expenses.vacationIndemnityCents +
    report.expenses.sickLeaveIndemnityCents +
    report.expenses.statutoryHolidayCents;

  const expenseSummaryRows: (string | number)[][] = showSalaryDetails
    ? [
        ["Salaires bruts (éducatrices)", formatCad(report.expenses.educatorGrossCents)],
        ["Cotisations employeur (QC)", formatCad(report.expenses.employerCotisationCents)],
        ["Indemnités vacances", formatCad(report.expenses.vacationIndemnityCents)],
        ["Provision maladie (0,8 %)", formatCad(report.expenses.sickLeaveIndemnityCents)],
        ["Indemnités jours fériés", formatCad(report.expenses.statutoryHolidayCents)],
        ["Autres dépenses (journal)", formatCad(report.expenses.otherDailyCents)],
        ["Dépenses fixes", formatCad(report.expenses.fixedExpensesCents)],
      ]
    : [
        ["Charges de personnel (total)", formatCad(payrollTotalCents)],
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

  const netPositive = report.netCents >= 0;

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
          className="period-report mx-auto max-w-5xl bg-white rounded-xl shadow-sm p-6 sm:p-10 print:shadow-none print:max-w-none print:rounded-none"
        >
          <style dangerouslySetInnerHTML={{ __html: REPORT_STYLES }} />

          <header className="report-hero">
            <h1>Rapport comptable — Garderie</h1>
            <p className="period">{periodLabel}</p>
            <p className="meta">
              {report.daysWithJournal} jour(s) saisi(s) dans le journal ·{" "}
              {report.statutoryHolidayDates.length} jour(s) férié(s) comptabilisé(s)
            </p>
          </header>

          <section className="report-section">
            <h2 className="report-section-title">1 — Budget global (synthèse)</h2>
            <div className="report-summary-grid">
              <div>
                <p className="report-card-label revenue">Revenus</p>
                <ReportTable
                  headers={[
                    { label: "Poste" },
                    { label: "Montant", align: "right" },
                  ]}
                  rows={revenueRows}
                  foot={["Total revenus", formatCad(report.revenue.totalCents)]}
                  cellClass={(j) => (j === 0 ? "text" : j === 1 ? "num" : undefined)}
                />
              </div>
              <div>
                <p className="report-card-label expense">Dépenses</p>
                <ReportTable
                  headers={[
                    { label: "Poste" },
                    { label: "Montant", align: "right" },
                  ]}
                  rows={expenseSummaryRows}
                  foot={["Total dépenses", formatCad(report.expenses.totalCents)]}
                  cellClass={(j) => (j === 0 ? "text" : j === 1 ? "num" : undefined)}
                />
              </div>
            </div>
            <div className="report-net">
              <p className="label">Résultat net</p>
              <p className={`value ${netPositive ? "positive" : "negative"}`}>
                {formatCad(report.netCents)}
              </p>
            </div>
          </section>

          {showSalaryDetails && (
            <section className="report-section">
              <h2 className="report-section-title">
                2 — Salaires et charges par employée
              </h2>
              <ReportTable
                tableClassName="report-table--payroll"
                headers={[
                  { label: "Employée" },
                  { label: "Heures", align: "right" },
                  { label: "Salaire brut", align: "right" },
                  { label: "Vac.", align: "right" },
                  { label: "Indem. vacances", align: "right" },
                  { label: "Maladie 0,8 %", align: "right" },
                  { label: "Cotis. employeur", align: "right" },
                  { label: "Fériés", align: "right" },
                ]}
                rows={payrollRows}
                foot={payrollFoot}
                cellClass={(j) => {
                  if (j === 0) return "text";
                  if (j >= 1) return "num";
                  return undefined;
                }}
              />
            </section>
          )}

          <section className="report-section">
            <h2 className="report-section-title">
              {showSalaryDetails ? "3 — Revenus détaillés" : "2 — Revenus détaillés"}
            </h2>
            <ReportTable
              headers={[
                { label: "Description" },
                { label: "Montant ($)", align: "right" },
              ]}
              rows={revenueRows}
              foot={["Total", formatCad(report.revenue.totalCents)]}
              cellClass={(j) => (j === 0 ? "text" : "num")}
            />
          </section>

          <section className="report-section">
            <h2 className="report-section-title">
              {showSalaryDetails ? "4 — Dépenses" : "3 — Dépenses"}
            </h2>
            <p className="report-section-hint">
              Autres dépenses du journal et dépenses fixes (point 5), tranches
              comptables incluses.
            </p>
            <ReportTable
              headers={[
                { label: "Origine" },
                { label: "Date" },
                { label: "Description" },
                { label: "Montant ($)", align: "right" },
                { label: "Période comptable" },
                { label: "Facture" },
                { label: "Responsable" },
                { label: "Note" },
              ]}
              rows={expenseDetailRows}
              foot={[
                "Total",
                "",
                "",
                formatCad(expenseDetailTotalCents),
                "",
                "",
                "",
                "",
              ]}
              cellClass={(j) => {
                if (j === 3) return "num";
                if (j === 0 || j === 1 || j === 4 || j === 5) return "muted";
                if (j === 2 || j === 7) return "text";
                return undefined;
              }}
            />
          </section>

          {showSalaryDetails && report.holidayIndemnityLines.length > 0 && (
            <section className="report-section">
              <h2 className="report-section-title">
                5 — Détail jours fériés (Québec)
              </h2>
              <ReportTable
                tableClassName="report-table--holiday"
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
                cellClass={(j) => {
                  if (j === 0) return "text";
                  if (j === 1 || j === 3) return "muted";
                  if (j === 2 || j === 4) return "num";
                  return undefined;
                }}
              />
            </section>
          )}

          <p className="report-footer">
            Généré depuis la plateforme —{" "}
            {format(new Date(), "d MMM yyyy HH:mm", { locale: fr })}
          </p>
        </div>
      </div>
    </div>
  );
}
