"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  format,
  parseISO,
  addDays,
  subDays,
  startOfMonth,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  Settings2,
} from "lucide-react";
import type {
  AccountingConfig,
  DailyJournal,
  EducatorPaySummary,
  JournalLine,
} from "@/types";
import {
  centsToDollars,
  computeEmployerContributionCents,
  computeGrossFromHours,
  formatCad,
  parseCadInput,
} from "@/lib/money";

type DraftLine = Omit<JournalLine, "id"> & { clientId: string };

function newClientId() {
  return `c-${Math.random().toString(36).slice(2, 11)}`;
}

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function enrollmentTotalCents(countStr: string, rateInput: string): number {
  const n = parseInt(countStr, 10);
  const rate = parseCadInput(rateInput || "0");
  if (!Number.isFinite(n) || n <= 0 || rate <= 0) return 0;
  return n * rate;
}

export default function ComptabilitePage() {
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [config, setConfig] = useState<AccountingConfig | null>(null);
  const [payRates, setPayRates] = useState<EducatorPaySummary[]>([]);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [infantCount, setInfantCount] = useState("");
  const [infantRateInput, setInfantRateInput] = useState("");
  const [over18Count, setOver18Count] = useState("");
  const [over18RateInput, setOver18RateInput] = useState("");
  const [hoursDraft, setHoursDraft] = useState<Record<string, string>>({});
  const [otherRevenueLabel, setOtherRevenueLabel] = useState("");
  const [otherRevenueAmount, setOtherRevenueAmount] = useState("");
  const [otherExpenseLabel, setOtherExpenseLabel] = useState("");
  const [otherExpenseAmount, setOtherExpenseAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<"idle" | "ok" | "err">("idle");
  const [showSettings, setShowSettings] = useState(false);
  const [monthSummaries, setMonthSummaries] = useState<
    {
      journalDate: string;
      totalRevenueCents: number;
      totalExpenseCents: number;
      balanceCents: number;
    }[]
  >([]);

  const actorId = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const u = JSON.parse(sessionStorage.getItem("user") || "{}") as {
        id?: string;
      };
      return u.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const loadDay = useCallback(async (date: string) => {
    setLoading(true);
    setSaveMsg("idle");
    try {
      const res = await fetch(`/api/accounting/journal?date=${encodeURIComponent(date)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chargement impossible");

      setConfig(data.config);
      setPayRates(Array.isArray(data.payRates) ? data.payRates : []);
      const cfg = data.config as AccountingConfig | undefined;
      setInfantRateInput(
        String(centsToDollars(cfg?.dailyInfantRateCents ?? 5200))
      );
      setOver18RateInput(
        String(centsToDollars(cfg?.dailyOver18RateCents ?? 4500))
      );

      const journal = data.journal as DailyJournal | null;
      if (journal) {
        setNotes(journal.notes ?? "");
        setLines(
          journal.lines
            .filter(
              (l) =>
                l.category === "revenue_other" || l.category === "expense_other"
            )
            .map((l) => ({
              ...l,
              clientId: l.id,
            }))
        );
        const infantLine = journal.lines.find(
          (l) => l.category === "revenue_enrollment_infant"
        );
        const over18Line = journal.lines.find(
          (l) =>
            l.category === "revenue_enrollment_over18" ||
            l.category === "revenue_enrollment"
        );
        if (infantLine) {
          setInfantCount(
            infantLine.childCount != null ? String(infantLine.childCount) : ""
          );
          if (infantLine.dailyRateCents != null) {
            setInfantRateInput(String(centsToDollars(infantLine.dailyRateCents)));
          }
        } else {
          setInfantCount("");
        }
        if (over18Line) {
          setOver18Count(
            over18Line.childCount != null ? String(over18Line.childCount) : ""
          );
          if (over18Line.dailyRateCents != null) {
            setOver18RateInput(String(centsToDollars(over18Line.dailyRateCents)));
          }
        } else {
          setOver18Count("");
        }
        const hours: Record<string, string> = {};
        for (const l of journal.lines) {
          if (
            l.category === "expense_educator_gross" &&
            l.educatorId &&
            l.hoursWorked != null
          ) {
            hours[l.educatorId] = String(l.hoursWorked);
          }
        }
        setHoursDraft(hours);
      } else {
        setNotes("");
        setLines([]);
        setInfantCount("");
        setOver18Count("");
        setHoursDraft({});
      }

      const month = date.slice(0, 7);
      const monthRes = await fetch(
        `/api/accounting/journal?month=${encodeURIComponent(month)}`
      );
      const monthData = await monthRes.json();
      setMonthSummaries(
        Array.isArray(monthData.summaries) ? monthData.summaries : []
      );
    } catch {
      setConfig(null);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  const infantRevenueCents = useMemo(
    () => enrollmentTotalCents(infantCount, infantRateInput),
    [infantCount, infantRateInput]
  );
  const over18RevenueCents = useMemo(
    () => enrollmentTotalCents(over18Count, over18RateInput),
    [over18Count, over18RateInput]
  );
  const enrollmentRevenueCents = infantRevenueCents + over18RevenueCents;

  const payrollLines = useMemo(() => {
    const out: DraftLine[] = [];
    for (const edu of payRates) {
      const raw = hoursDraft[edu.id]?.replace(",", ".") ?? "";
      const hours = parseFloat(raw);
      if (!Number.isFinite(hours) || hours <= 0) continue;
      const rate = edu.hourlyRateCents ?? 0;
      if (rate <= 0) continue;
      const gross = computeGrossFromHours(hours, rate);
      const pct =
        edu.employerContributionPercent ??
        config?.defaultEmployerContributionPercent ??
        18;
      const cotisation = computeEmployerContributionCents(gross, pct);
      out.push({
        clientId: `pay-gross-${edu.id}`,
        kind: "expense",
        category: "expense_educator_gross",
        label: `Salaire — ${edu.name}`,
        amountCents: gross,
        educatorId: edu.id,
        educatorName: edu.name,
        hoursWorked: hours,
        hourlyRateCents: rate,
        employerContributionPercent: pct,
      });
      if (cotisation > 0) {
        out.push({
          clientId: `pay-cot-${edu.id}`,
          kind: "expense",
          category: "expense_employer_cotisation",
          label: `Cotisations employeur — ${edu.name}`,
          amountCents: cotisation,
          educatorId: edu.id,
          educatorName: edu.name,
          hoursWorked: hours,
          hourlyRateCents: rate,
          employerContributionPercent: pct,
        });
      }
    }
    return out;
  }, [hoursDraft, payRates, config]);

  const manualLines = useMemo(
    () =>
      lines.filter(
        (l) =>
          l.category === "revenue_other" || l.category === "expense_other"
      ),
    [lines]
  );

  const allLinesForSave = useMemo(() => {
    const built: DraftLine[] = [];
    if (infantRevenueCents > 0) {
      built.push({
        clientId: "enrollment-infant",
        kind: "revenue",
        category: "revenue_enrollment_infant",
        label: "Poupons (6 à 18 mois)",
        amountCents: infantRevenueCents,
        childCount: parseInt(infantCount, 10),
        dailyRateCents: parseCadInput(infantRateInput || "0"),
      });
    }
    if (over18RevenueCents > 0) {
      built.push({
        clientId: "enrollment-over18",
        kind: "revenue",
        category: "revenue_enrollment_over18",
        label: "18 mois et plus",
        amountCents: over18RevenueCents,
        childCount: parseInt(over18Count, 10),
        dailyRateCents: parseCadInput(over18RateInput || "0"),
      });
    }
    built.push(...manualLines);
    built.push(...payrollLines);
    return built;
  }, [
    infantRevenueCents,
    over18RevenueCents,
    infantCount,
    over18Count,
    infantRateInput,
    over18RateInput,
    manualLines,
    payrollLines,
  ]);

  const totals = useMemo(() => {
    let revenue = 0;
    let expense = 0;
    for (const l of allLinesForSave) {
      if (l.kind === "revenue") revenue += l.amountCents;
      else expense += l.amountCents;
    }
    return { revenue, expense, balance: revenue - expense };
  }, [allLinesForSave]);

  const addOtherRevenue = () => {
    const amount = parseCadInput(otherRevenueAmount);
    if (amount <= 0) return;
    setLines((prev) => [
      ...prev,
      {
        clientId: newClientId(),
        kind: "revenue",
        category: "revenue_other",
        label: otherRevenueLabel.trim() || "Autre revenu",
        amountCents: amount,
      },
    ]);
    setOtherRevenueLabel("");
    setOtherRevenueAmount("");
  };

  const addOtherExpense = () => {
    const amount = parseCadInput(otherExpenseAmount);
    if (amount <= 0) return;
    setLines((prev) => [
      ...prev,
      {
        clientId: newClientId(),
        kind: "expense",
        category: "expense_other",
        label: otherExpenseLabel.trim() || "Autre dépense",
        amountCents: amount,
      },
    ]);
    setOtherExpenseLabel("");
    setOtherExpenseAmount("");
  };

  const removeManualLine = (clientId: string) => {
    setLines((prev) => prev.filter((l) => l.clientId !== clientId));
  };

  const saveJournal = async () => {
    if (!actorId) return;
    setSaving(true);
    setSaveMsg("idle");
    try {
      const payload = {
        date: selectedDate,
        notes,
        _actorEducatorId: actorId,
        lines: allLinesForSave.map(({ clientId: _, ...rest }) => rest),
      };
      const res = await fetch("/api/accounting/journal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec");
      setSaveMsg("ok");
      await loadDay(selectedDate);
    } catch {
      setSaveMsg("err");
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!actorId || !config) return;
    const res = await fetch("/api/accounting/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _actorEducatorId: actorId,
        dailyInfantRateCents: parseCadInput(infantRateInput || "0"),
        dailyOver18RateCents: parseCadInput(over18RateInput || "0"),
        defaultEmployerContributionPercent: config.defaultEmployerContributionPercent,
      }),
    });
    if (res.ok) {
      const c = await res.json();
      setConfig(c);
    }
  };

  const savePayRate = async (eduId: string, hourlyDollars: string) => {
    if (!actorId) return;
    const cents = parseCadInput(hourlyDollars);
    await fetch("/api/educators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: eduId,
        hourlyRateCents: cents,
        _actorEducatorId: actorId,
      }),
    });
    setPayRates((prev) =>
      prev.map((e) =>
        e.id === eduId ? { ...e, hourlyRateCents: cents || undefined } : e
      )
    );
  };

  const dateLabel = format(parseISO(selectedDate), "EEEE d MMMM yyyy", {
    locale: fr,
  });

  const monthStart = startOfMonth(parseISO(selectedDate));

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Demandes
        </Link>
        <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary-500" />
          Journal du jour
        </h1>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Settings2 className="h-4 w-4" />
          Tarifs
        </button>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 !p-4">
        <button
          type="button"
          className="rounded-xl p-2 hover:bg-slate-100"
          onClick={() =>
            setSelectedDate(format(subDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))
          }
          aria-label="Jour précédent"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="text-center min-w-0 flex-1">
          <p className="text-sm text-slate-500 capitalize">{dateLabel}</p>
          <input
            type="date"
            className="input-field mt-1 max-w-[220px] mx-auto text-center"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button
            type="button"
            className="mt-2 text-sm text-primary-600 font-medium"
            onClick={() => setSelectedDate(todayIso())}
          >
            Aujourd&apos;hui
          </button>
        </div>
        <button
          type="button"
          className="rounded-xl p-2 hover:bg-slate-100"
          onClick={() =>
            setSelectedDate(format(addDays(parseISO(selectedDate), 1), "yyyy-MM-dd"))
          }
          aria-label="Jour suivant"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {showSettings && config && (
        <div className="card space-y-4 border-primary-100 bg-primary-50/30">
          <h2 className="font-semibold text-slate-800">Paramètres rapides</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">
                Tarif poupon (6–18 mois) / jour ($)
              </span>
              <input
                className="input-field mt-1"
                value={infantRateInput}
                onChange={(e) => setInfantRateInput(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">
                Tarif 18 mois et + / jour ($)
              </span>
              <input
                className="input-field mt-1"
                value={over18RateInput}
                onChange={(e) => setOver18RateInput(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">
                Cotisations employeur par défaut (%)
              </span>
              <input
                className="input-field mt-1"
                type="number"
                step="0.1"
                value={config.defaultEmployerContributionPercent}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    defaultEmployerContributionPercent: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </label>
          </div>
          <button type="button" className="btn-secondary text-sm" onClick={saveConfig}>
            Enregistrer les paramètres
          </button>
          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">
              Taux horaires du personnel
            </p>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {payRates.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="min-w-[8rem] font-medium text-slate-800">
                    {e.name}
                  </span>
                  <input
                    className="input-field !py-2 !min-h-0 w-28"
                    placeholder="25,50"
                    defaultValue={
                      e.hourlyRateCents
                        ? centsToDollars(e.hourlyRateCents).toFixed(2)
                        : ""
                    }
                    onBlur={(ev) => savePayRate(e.id, ev.target.value)}
                  />
                  <span className="text-slate-500">$/h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
          <div className="flex items-center gap-2 text-emerald-800 text-sm font-medium">
            <TrendingUp className="h-4 w-4" />
            Revenus
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {formatCad(totals.revenue)}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-4">
          <div className="flex items-center gap-2 text-rose-800 text-sm font-medium">
            <TrendingDown className="h-4 w-4" />
            Dépenses
          </div>
          <p className="mt-1 text-2xl font-bold text-rose-900">
            {formatCad(totals.expense)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-slate-600 text-sm font-medium">Solde du jour</div>
          <p
            className={`mt-1 text-2xl font-bold ${
              totals.balance >= 0 ? "text-slate-900" : "text-rose-700"
            }`}
          >
            {formatCad(totals.balance)}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-slate-500 py-8">Chargement…</p>
      ) : (
        <>
          <section className="card space-y-4">
            <h2 className="font-semibold text-lg text-slate-800">Revenus</h2>
            <div className="rounded-xl bg-sage-50 border border-sage-100 p-4 space-y-4">
              <p className="text-sm font-medium text-slate-700">
                Inscriptions du jour
              </p>
              <div className="rounded-lg bg-white border border-sage-100 p-3 space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  Poupons (6 à 18 mois)
                </p>
                <div className="grid gap-3 sm:grid-cols-3 items-end">
                  <label className="text-sm block">
                    <span className="text-slate-600">Nombre d&apos;enfants</span>
                    <input
                      className="input-field mt-1"
                      type="number"
                      min={0}
                      value={infantCount}
                      onChange={(e) => setInfantCount(e.target.value)}
                    />
                  </label>
                  <label className="text-sm block">
                    <span className="text-slate-600">Tarif / jour ($)</span>
                    <input
                      className="input-field mt-1"
                      inputMode="decimal"
                      value={infantRateInput}
                      onChange={(e) => setInfantRateInput(e.target.value)}
                    />
                  </label>
                  <div>
                    <p className="text-xs text-slate-500">Sous-total</p>
                    <p className="text-lg font-bold text-emerald-700">
                      {formatCad(infantRevenueCents)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-white border border-sage-100 p-3 space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  18 mois et plus
                </p>
                <div className="grid gap-3 sm:grid-cols-3 items-end">
                  <label className="text-sm block">
                    <span className="text-slate-600">Nombre d&apos;enfants</span>
                    <input
                      className="input-field mt-1"
                      type="number"
                      min={0}
                      value={over18Count}
                      onChange={(e) => setOver18Count(e.target.value)}
                    />
                  </label>
                  <label className="text-sm block">
                    <span className="text-slate-600">Tarif / jour ($)</span>
                    <input
                      className="input-field mt-1"
                      inputMode="decimal"
                      value={over18RateInput}
                      onChange={(e) => setOver18RateInput(e.target.value)}
                    />
                  </label>
                  <div>
                    <p className="text-xs text-slate-500">Sous-total</p>
                    <p className="text-lg font-bold text-emerald-700">
                      {formatCad(over18RevenueCents)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end border-t border-sage-200 pt-3">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total inscriptions</p>
                  <p className="text-xl font-bold text-emerald-800">
                    {formatCad(enrollmentRevenueCents)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-sm flex-1 min-w-[140px]">
                <span className="text-slate-600">Autre revenu</span>
                <input
                  className="input-field mt-1"
                  value={otherRevenueLabel}
                  onChange={(e) => setOtherRevenueLabel(e.target.value)}
                  placeholder="Ex. subvention, location…"
                />
              </label>
              <label className="text-sm w-32">
                <span className="text-slate-600">Montant ($)</span>
                <input
                  className="input-field mt-1"
                  inputMode="decimal"
                  value={otherRevenueAmount}
                  onChange={(e) => setOtherRevenueAmount(e.target.value)}
                />
              </label>
              <button type="button" className="btn-secondary" onClick={addOtherRevenue}>
                <Plus className="h-4 w-4" />
                Ajouter
              </button>
            </div>
            {manualLines
              .filter((l) => l.kind === "revenue")
              .map((l) => (
                <div
                  key={l.clientId}
                  className="flex justify-between items-center text-sm bg-emerald-50/50 rounded-lg px-3 py-2"
                >
                  <span>
                    {l.label} — <strong>{formatCad(l.amountCents)}</strong>
                  </span>
                  <button
                    type="button"
                    className="text-rose-600 p-2"
                    onClick={() => removeManualLine(l.clientId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
          </section>

          <section className="card space-y-4">
            <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary-500" />
              Heures &amp; paie
            </h2>
            <p className="text-sm text-slate-600">
              Entrez les heures travaillées : le salaire brut et les cotisations
              employeur se calculent automatiquement selon le taux horaire.
            </p>
            <div className="space-y-2">
              {payRates.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun profil paie configuré.</p>
              ) : (
                payRates.map((edu) => {
                  const raw = hoursDraft[edu.id]?.replace(",", ".") ?? "";
                  const hours = parseFloat(raw);
                  const rate = edu.hourlyRateCents ?? 0;
                  const gross =
                    Number.isFinite(hours) && hours > 0 && rate > 0
                      ? computeGrossFromHours(hours, rate)
                      : 0;
                  const pct =
                    edu.employerContributionPercent ??
                    config?.defaultEmployerContributionPercent ??
                    18;
                  const cot =
                    gross > 0 ? computeEmployerContributionCents(gross, pct) : 0;
                  return (
                    <div
                      key={edu.id}
                      className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr] items-center rounded-xl border border-slate-100 p-3"
                    >
                      <span className="font-medium text-slate-800 text-sm">
                        {edu.name}
                        {rate > 0 ? (
                          <span className="text-slate-500 font-normal ml-1">
                            ({formatCad(rate)}/h)
                          </span>
                        ) : (
                          <span className="text-amber-600 text-xs ml-1">
                            — taux à définir
                          </span>
                        )}
                      </span>
                      <input
                        className="input-field !py-2 !min-h-0 text-center"
                        type="number"
                        min={0}
                        step={0.25}
                        placeholder="h"
                        value={hoursDraft[edu.id] ?? ""}
                        onChange={(e) =>
                          setHoursDraft((h) => ({
                            ...h,
                            [edu.id]: e.target.value,
                          }))
                        }
                      />
                      <span className="text-xs sm:text-sm text-slate-600">
                        {gross > 0 ? (
                          <>
                            Brut {formatCad(gross)}
                            {cot > 0 && (
                              <> · Cotis. {formatCad(cot)}</>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="card space-y-4">
            <h2 className="font-semibold text-lg text-slate-800">Autres dépenses</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-sm flex-1 min-w-[140px]">
                <span className="text-slate-600">Description</span>
                <input
                  className="input-field mt-1"
                  value={otherExpenseLabel}
                  onChange={(e) => setOtherExpenseLabel(e.target.value)}
                  placeholder="Ex. épicerie, fournitures…"
                />
              </label>
              <label className="text-sm w-32">
                <span className="text-slate-600">Montant ($)</span>
                <input
                  className="input-field mt-1"
                  inputMode="decimal"
                  value={otherExpenseAmount}
                  onChange={(e) => setOtherExpenseAmount(e.target.value)}
                />
              </label>
              <button type="button" className="btn-secondary" onClick={addOtherExpense}>
                <Plus className="h-4 w-4" />
                Ajouter
              </button>
            </div>
            {manualLines
              .filter((l) => l.kind === "expense")
              .map((l) => (
                <div
                  key={l.clientId}
                  className="flex justify-between items-center text-sm bg-rose-50/50 rounded-lg px-3 py-2"
                >
                  <span>
                    {l.label} — <strong>{formatCad(l.amountCents)}</strong>
                  </span>
                  <button
                    type="button"
                    className="text-rose-600 p-2"
                    onClick={() => removeManualLine(l.clientId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
          </section>

          <label className="block card !p-4">
            <span className="text-sm font-medium text-slate-700">
              Note du jour (optionnel)
            </span>
            <textarea
              className="input-field mt-2 min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. paiement comptable, événement spécial…"
            />
          </label>

          {monthSummaries.length > 0 && (
            <section className="card">
              <h2 className="font-semibold text-slate-800 mb-3">
                Mois en cours ({format(monthStart, "MMMM yyyy", { locale: fr })})
              </h2>
              <ul className="space-y-1 text-sm max-h-40 overflow-y-auto">
                {monthSummaries.map((s) => (
                  <li key={s.journalDate}>
                    <button
                      type="button"
                      className={`w-full flex justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 ${
                        s.journalDate === selectedDate ? "bg-primary-50" : ""
                      }`}
                      onClick={() => setSelectedDate(s.journalDate)}
                    >
                      <span>{format(parseISO(s.journalDate), "d MMM", { locale: fr })}</span>
                      <span className="text-slate-600">
                        {formatCad(s.balanceCents)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-3 justify-between">
          <p className="text-sm text-slate-600">
            Solde :{" "}
            <strong className={totals.balance >= 0 ? "text-emerald-700" : "text-rose-700"}>
              {formatCad(totals.balance)}
            </strong>
            {saveMsg === "ok" && (
              <span className="ml-2 text-emerald-600">Enregistré ✓</span>
            )}
            {saveMsg === "err" && (
              <span className="ml-2 text-rose-600">Erreur — réessayez</span>
            )}
          </p>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            disabled={saving || loading}
            onClick={saveJournal}
          >
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement…" : "Enregistrer la journée"}
          </button>
        </div>
      </div>
    </div>
  );
}
