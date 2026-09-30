"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart3, Plus, Trash2, RefreshCw, Calendar } from "lucide-react";
import type { PeriodReport } from "@/lib/accounting-period-report";
import { FIXED_EXPENSE_SUGGESTIONS } from "@/lib/fixed-expense-catalog";
import { formatCad, parseCadInput } from "@/lib/money";

type Props = {
  actorId: string | null;
};

export function PeriodAnalysisPanel({ actorId }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fixLabel, setFixLabel] = useState(FIXED_EXPENSE_SUGGESTIONS[0] ?? "");
  const [fixAmount, setFixAmount] = useState("");
  const [fixSource, setFixSource] = useState("");
  const [fixNote, setFixNote] = useState("");
  const [addingFixed, setAddingFixed] = useState(false);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const addFixedExpense = async () => {
    if (!actorId || !from || !to) return;
    setAddingFixed(true);
    try {
      const res = await fetch("/api/accounting/fixed-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: from,
          periodEnd: to,
          label: fixLabel,
          amountDollars: fixAmount,
          sourceName: fixSource,
          note: fixNote,
          _actorEducatorId: actorId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setFixAmount("");
      setFixNote("");
      await loadReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAddingFixed(false);
    }
  };

  const removeFixed = async (id: string) => {
    if (!actorId) return;
    await fetch("/api/accounting/fixed-expenses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, _actorEducatorId: actorId }),
    });
    await loadReport();
  };

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary-500" />
          Analyse de période
        </h2>
        <p className="text-sm text-slate-600">
          Les revenus et salaires du journal sont cumulés entre <strong>Du</strong> et{" "}
          <strong>Au</strong>. Pour chaque <strong>date de jour férié</strong> dans cette
          période, l&apos;indemnité suit la règle québécoise :{" "}
          <strong>1/20 du salaire brut</strong> gagné durant les{" "}
          <strong>4 semaines complètes</strong> qui précèdent la semaine du férié — en
          lisant les heures saisies dans le journal,{" "}
          <em>même si ces semaines sont avant la date « Du »</em>.
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

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Dates des jours fériés (dans la période)
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm flex-1 min-w-[160px]">
              <span className="text-slate-600">Date du férié</span>
              <input
                type="date"
                className="input-field mt-1"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
              />
            </label>
            <button type="button" className="btn-secondary" onClick={addHolidayDate}>
              <Plus className="h-4 w-4" />
              Ajouter
            </button>
          </div>
          {holidayDates.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {holidayDates.map((d) => (
                <li
                  key={d}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-sm"
                >
                  {format(parseISO(d), "d MMM yyyy", { locale: fr })}
                  <button
                    type="button"
                    className="text-rose-600 p-1"
                    onClick={() =>
                      setHolidayDates((prev) => prev.filter((x) => x !== d))
                    }
                    aria-label="Retirer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
            <p className="text-sm text-slate-500">
              {format(parseISO(report.from), "d MMM yyyy", { locale: fr })} →{" "}
              {format(parseISO(report.to), "d MMM yyyy", { locale: fr })} ·{" "}
              {report.daysWithJournal} jour(s) saisi(s) dans la période ·{" "}
              {report.statutoryHolidayDates.length} férié(s) saisi(s)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-1 text-sm">
                <p className="font-semibold text-emerald-900">Revenus</p>
                <p>Inscriptions : {formatCad(report.revenue.enrollmentCents)}</p>
                <p>Sorties : {formatCad(report.revenue.sortieCents)}</p>
                <p>Photos : {formatCad(report.revenue.photoCents)}</p>
                <p>Autres : {formatCad(report.revenue.otherCents)}</p>
                <p className="font-bold text-emerald-800 pt-1">
                  Total {formatCad(report.revenue.totalCents)}
                </p>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 space-y-1 text-sm">
                <p className="font-semibold text-rose-900">Dépenses</p>
                <p>Salaires bruts : {formatCad(report.expenses.educatorGrossCents)}</p>
                <p>Cotisations employeur : {formatCad(report.expenses.employerCotisationCents)}</p>
                <p>Indemnités vacances : {formatCad(report.expenses.vacationIndemnityCents)}</p>
                <p>Maladie (0,8 %) : {formatCad(report.expenses.sickLeaveIndemnityCents)}</p>
                <p>
                  Jours fériés (1/20 × 4 sem.) :{" "}
                  {formatCad(report.expenses.statutoryHolidayCents)}
                </p>
                <p>Autres (journal) : {formatCad(report.expenses.otherDailyCents)}</p>
                <p>Frais fixes : {formatCad(report.expenses.fixedExpensesCents)}</p>
                <p className="font-bold text-rose-800 pt-1">
                  Total {formatCad(report.expenses.totalCents)}
                </p>
              </div>
            </div>
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
          </div>

          {report.holidayIndemnityLines.length > 0 && (
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

          <div className="card space-y-4">
            <h3 className="font-semibold text-slate-800">Dépenses fixes (période)</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <label className="text-sm block sm:col-span-2">
                <span className="text-slate-600">Dépense</span>
                <input
                  list="fixed-expense-suggestions"
                  className="input-field mt-1"
                  value={fixLabel}
                  onChange={(e) => setFixLabel(e.target.value)}
                />
                <datalist id="fixed-expense-suggestions">
                  {FIXED_EXPENSE_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm block">
                <span className="text-slate-600">Montant ($)</span>
                <input
                  className="input-field mt-1"
                  inputMode="decimal"
                  value={fixAmount}
                  onChange={(e) => setFixAmount(e.target.value)}
                />
              </label>
              <label className="text-sm block">
                <span className="text-slate-600">Responsable</span>
                <input
                  className="input-field mt-1"
                  placeholder="Ex. Kamar"
                  value={fixSource}
                  onChange={(e) => setFixSource(e.target.value)}
                />
              </label>
            </div>
            <label className="text-sm block">
              <span className="text-slate-600">Note</span>
              <input
                className="input-field mt-1"
                value={fixNote}
                onChange={(e) => setFixNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              disabled={addingFixed}
              onClick={addFixedExpense}
            >
              <Plus className="h-4 w-4" />
              Ajouter la dépense fixe
            </button>
            {report.fixedExpenses.length > 0 && (
              <ul className="divide-y divide-slate-100 text-sm">
                {report.fixedExpenses.map((f) => (
                  <li key={f.id} className="flex justify-between items-center py-2 gap-2">
                    <span>
                      {f.label} — <strong>{formatCad(f.amountCents)}</strong>
                      {f.sourceName && (
                        <span className="text-slate-500"> ({f.sourceName})</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="text-rose-600 p-2"
                      onClick={() => removeFixed(f.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
