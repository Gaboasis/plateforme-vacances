"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart3, RefreshCw, Calendar, FileSpreadsheet } from "lucide-react";
import type { PeriodReport } from "@/lib/accounting-period-report";
import { formatCad } from "@/lib/money";
import { PeriodReportDocument } from "@/components/accounting/PeriodReportDocument";

type Props = {
  actorId: string | null;
  /** Détails paie (salaires, cotisations, fériés par employée) — admin seulement. */
  showSalaryDetails?: boolean;
};

export function PeriodAnalysisPanel({
  actorId,
  showSalaryDetails = true,
}: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFullReport, setShowFullReport] = useState(false);

  const addHolidayDate = () => {
    const d = newHolidayDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (holidayDates.includes(d)) return;
    setHolidayDates((prev) => [...prev, d].sort());
    setNewHolidayDate("");
  };

  const loadReport = async () => {
    if (!actorId || !from || !to) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        from,
        to,
        statutoryHolidayDates: holidayDates.join(","),
        _actorEducatorId: actorId,
      });
      const res = await fetch(`/api/accounting/period-report?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setReport(data as PeriodReport);
      setShowFullReport(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {showFullReport && report && (
        <PeriodReportDocument
          report={report}
          showSalaryDetails={showSalaryDetails}
          onClose={() => setShowFullReport(false)}
        />
      )}
      <div className="card space-y-4">
        <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary-500" />
          Analyse de période
        </h2>
        <p className="text-sm text-slate-600">
          Les revenus et salaires du journal sont cumulés entre <strong>Du</strong> et{" "}
          <strong>Au</strong>. Les <strong>dépenses fixes</strong> (point 5 Excel) se
          saisissent dans l&apos;onglet <strong>Journal du jour</strong> et sont cumulées
          ici. Pour chaque <strong>date de jour férié</strong>, l&apos;indemnité suit la
          règle québécoise : <strong>1/20 du salaire brut</strong> sur les{" "}
          <strong>4 semaines complètes</strong> avant la semaine du férié. Après{" "}
          <strong>Calculer</strong>, ouvrez le{" "}
          <strong>rapport détaillé (style Excel)</strong> pour imprimer ou enregistrer
          en PDF.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm block">
            <span className="text-slate-600">Du</span>
            <input
              type="date"
              className="input-field mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm block">
            <span className="text-slate-600">Au</span>
            <input
              type="date"
              className="input-field mt-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Dates de jours fériés dans la période
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm block flex-1 min-w-[160px]">
              <span className="text-slate-600">Date férié</span>
              <input
                type="date"
                className="input-field mt-1"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
              />
            </label>
            <button type="button" className="btn-secondary" onClick={addHolidayDate}>
              Ajouter
            </button>
          </div>
          {holidayDates.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {holidayDates.map((d) => (
                <li
                  key={d}
                  className="text-sm bg-slate-100 rounded-lg px-3 py-1 flex items-center gap-2"
                >
                  {format(parseISO(d), "d MMM yyyy", { locale: fr })}
                  <button
                    type="button"
                    className="text-slate-500 hover:text-rose-600"
                    onClick={() =>
                      setHolidayDates((prev) => prev.filter((x) => x !== d))
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              Aucun férié : laissez vide ou ajoutez chaque date (ex. fête du Canada).
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          disabled={loading || !from || !to || !actorId}
          onClick={loadReport}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Calculer
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {report && (
        <>
          <div className="card space-y-3">
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowFullReport(true)}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Rapport détaillé (style Excel)
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {format(parseISO(report.from), "d MMM yyyy", { locale: fr })} →{" "}
              {format(parseISO(report.to), "d MMM yyyy", { locale: fr })} ·{" "}
              {report.daysWithJournal} jour(s) saisi(s) dans la période ·{" "}
              {report.statutoryHolidayDates.length} férié(s) saisi(s)
            </p>
            <div
              className={`grid gap-3 ${
                showSalaryDetails ? "sm:grid-cols-2" : "sm:grid-cols-1"
              }`}
            >
              {showSalaryDetails && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-1 text-sm">
                  <p className="font-semibold text-emerald-900">Revenus</p>
                  <p>Inscriptions : {formatCad(report.revenue.enrollmentCents)}</p>
                  <p>Autres revenus : {formatCad(report.revenue.otherCents)}</p>
                  <p className="font-bold text-emerald-800 pt-1">
                    Total {formatCad(report.revenue.totalCents)}
                  </p>
                </div>
              )}
              <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 space-y-1 text-sm">
                <p className="font-semibold text-rose-900">Dépenses</p>
                {showSalaryDetails ? (
                  <>
                    <p>Salaires bruts : {formatCad(report.expenses.educatorGrossCents)}</p>
                    <p>
                      Cotisations employeur :{" "}
                      {formatCad(report.expenses.employerCotisationCents)}
                    </p>
                    <p>
                      Indemnités vacances :{" "}
                      {formatCad(report.expenses.vacationIndemnityCents)}
                    </p>
                    <p>
                      Maladie (0,8 %) : {formatCad(report.expenses.sickLeaveIndemnityCents)}
                    </p>
                    <p>
                      Jours fériés (1/20 × 4 sem.) :{" "}
                      {formatCad(report.expenses.statutoryHolidayCents)}
                    </p>
                  </>
                ) : null}
                <p>Autres (journal) : {formatCad(report.expenses.otherDailyCents)}</p>
                <p>
                  5. Dépenses fixes : {formatCad(report.expenses.fixedExpensesCents)}
                </p>
                <p className="font-bold text-rose-800 pt-1">
                  Total {formatCad(report.expenses.totalCents)}
                </p>
              </div>
            </div>
            {showSalaryDetails && (
              <div className="rounded-xl bg-slate-100 p-4 text-center">
                <p className="text-sm text-slate-600">Résultat net</p>
                <p
                  className={`text-2xl font-bold ${
                    report.netCents >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {formatCad(report.netCents)}
                </p>
              </div>
            )}
          </div>

          {report.fixedExpenses.length > 0 && (
            <div className="card space-y-2">
              <h3 className="font-semibold text-slate-800">
                Détail dépenses fixes (saisies au journal)
              </h3>
              <ul className="divide-y divide-slate-100 text-sm">
                {report.fixedExpenses.map((f) => (
                  <li key={f.id} className="py-2">
                    {f.label} — <strong>{formatCad(f.amountCents)}</strong>
                    {f.sourceName && (
                      <span className="text-slate-500"> ({f.sourceName})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showSalaryDetails && report.holidayIndemnityLines.length > 0 && (
            <div className="card overflow-x-auto">
              <h3 className="font-semibold text-slate-800 mb-3">
                Détail indemnités jours fériés (Québec)
              </h3>
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-2">Employée</th>
                    <th className="py-2 pr-2">Férié</th>
                    <th className="py-2 pr-2">Salaire ref. (4 sem.)</th>
                    <th className="py-2 pr-2">Période ref.</th>
                    <th className="py-2 text-right">Indemnité</th>
                  </tr>
                </thead>
                <tbody>
                  {report.holidayIndemnityLines.map((h, i) => (
                    <tr key={`${h.educatorId}-${h.holidayDate}-${i}`} className="border-b border-slate-50">
                      <td className="py-2 pr-2">{h.educatorName}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {format(parseISO(h.holidayDate), "d MMM yyyy", { locale: fr })}
                      </td>
                      <td className="py-2 pr-2">
                        {formatCad(h.referenceGrossCents)}
                        <span className="text-slate-400 text-xs ml-1">
                          ({h.referenceDaysWorked} j.)
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-xs text-slate-600 whitespace-nowrap">
                        {h.referenceFrom} → {h.referenceTo}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {formatCad(h.indemnityCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-500 mt-2">
                Formule : salaire brut des 4 semaines avant la semaine du férié ÷ 20
                (par férié et par employée).
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
