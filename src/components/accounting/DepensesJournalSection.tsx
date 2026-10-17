"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FixedExpenseEntry, JournalLine } from "@/types";
import {
  FIXED_EXPENSE_CUSTOM_OPTION,
  FIXED_EXPENSE_SUGGESTIONS,
} from "@/lib/fixed-expense-catalog";
import {
  defaultCoverageEnd,
  isValidDateKey,
  splitAmountByCoverageDays,
} from "@/lib/fixed-expense-split";
import { formatCad, parseCadInput } from "@/lib/money";

export type OtherExpenseDraftLine = Omit<JournalLine, "id"> & { clientId: string };

type ExpenseKind = "fixed" | "journal";

type Props = {
  actorId: string | null;
  journalDate: string;
  onTotalCentsChange?: (totalCents: number) => void;
  readOnly?: boolean;
  getEditPassword?: () => string | undefined;
  otherExpenseLines: OtherExpenseDraftLine[];
  onAppendOtherLines: (lines: OtherExpenseDraftLine[]) => void;
  onRemoveOtherLine: (clientId: string) => void;
  newClientId: () => string;
};

function formatSegmentPeriod(start: string, end: string): string {
  if (start === end) return start;
  return `${start} → ${end}`;
}

function OriginBadge({ kind }: { kind: ExpenseKind }) {
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        kind === "fixed"
          ? "bg-violet-100 text-violet-800"
          : "bg-slate-200 text-slate-700"
      }`}
    >
      {kind === "fixed" ? "Fixe" : "Variable"}
    </span>
  );
}

export function DepensesJournalSection({
  actorId,
  journalDate,
  onTotalCentsChange,
  readOnly = false,
  getEditPassword,
  otherExpenseLines,
  onAppendOtherLines,
  onRemoveOtherLine,
  newClientId,
}: Props) {
  const [fixedItems, setFixedItems] = useState<FixedExpenseEntry[]>([]);
  const [loadingFixed, setLoadingFixed] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const [expenseKind, setExpenseKind] = useState<ExpenseKind>("fixed");
  const [pick, setPick] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [journalLabel, setJournalLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [note, setNote] = useState("");
  const [splitAcrossMonths, setSplitAcrossMonths] = useState(false);
  const [coverageStart, setCoverageStart] = useState(journalDate);
  const [coverageEnd, setCoverageEnd] = useState(() =>
    defaultCoverageEnd(journalDate)
  );

  useEffect(() => {
    setCoverageStart(journalDate);
    setCoverageEnd(defaultCoverageEnd(journalDate));
  }, [journalDate]);

  const splitPreview = useMemo(() => {
    if (!splitAcrossMonths) return [];
    const cents = parseCadInput(amount);
    if (cents <= 0 || !isValidDateKey(coverageStart) || !isValidDateKey(coverageEnd)) {
      return [];
    }
    try {
      return splitAmountByCoverageDays(cents, coverageStart, coverageEnd);
    } catch {
      return [];
    }
  }, [splitAcrossMonths, amount, coverageStart, coverageEnd]);

  const coverageValid =
    isValidDateKey(coverageStart) &&
    isValidDateKey(coverageEnd) &&
    coverageStart <= coverageEnd;

  const resolvedFixedLabel =
    pick === FIXED_EXPENSE_CUSTOM_OPTION ? customLabel.trim() : pick.trim();

  const loadFixedItems = useCallback(async () => {
    if (!actorId || !journalDate) {
      setFixedItems([]);
      return;
    }
    setLoadingFixed(true);
    setError("");
    try {
      const q = new URLSearchParams({
        journalDay: journalDate,
        _actorEducatorId: actorId,
      });
      const res = await fetch(`/api/accounting/fixed-expenses?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setFixedItems((data.items ?? []) as FixedExpenseEntry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setFixedItems([]);
    } finally {
      setLoadingFixed(false);
    }
  }, [actorId, journalDate]);

  useEffect(() => {
    loadFixedItems();
  }, [loadFixedItems]);

  const fixedTotal = fixedItems.reduce((s, i) => s + i.amountCents, 0);
  const otherTotal = otherExpenseLines.reduce((s, l) => s + l.amountCents, 0);

  useEffect(() => {
    onTotalCentsChange?.(fixedTotal + otherTotal);
  }, [fixedTotal, otherTotal, onTotalCentsChange]);

  const resetForm = () => {
    setAmount("");
    setNote("");
    setCustomLabel("");
    setJournalLabel("");
    setPick("");
    setSourceName("");
    setSplitAcrossMonths(false);
  };

  const addFixedItem = async () => {
    if (!actorId || !journalDate || !resolvedFixedLabel) return;
    if (splitAcrossMonths && !coverageValid) {
      setError("Indiquez une période de facture valide (début ≤ fin).");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        periodStart: journalDate,
        periodEnd: journalDate,
        invoiceDate: journalDate,
        label: resolvedFixedLabel,
        amountDollars: amount,
        sourceName,
        note,
        _actorEducatorId: actorId,
        editPassword: getEditPassword?.(),
      };
      if (splitAcrossMonths) {
        payload.coverageStart = coverageStart;
        payload.coverageEnd = coverageEnd;
      }
      const res = await fetch("/api/accounting/fixed-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      resetForm();
      await loadFixedItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAdding(false);
    }
  };

  const addJournalItem = () => {
    const cents = parseCadInput(amount);
    if (cents <= 0) return;
    const label = journalLabel.trim() || "Autre dépense";
    if (splitAcrossMonths && !coverageValid) {
      setError("Indiquez une période de facture valide (début ≤ fin).");
      return;
    }
    setError("");
    if (splitAcrossMonths) {
      let segments;
      try {
        segments = splitAmountByCoverageDays(cents, coverageStart, coverageEnd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Période invalide.");
        return;
      }
      const splitGroupId = newClientId();
      const newLines: OtherExpenseDraftLine[] = segments.map((s) => ({
        clientId: newClientId(),
        kind: "expense",
        category: "expense_other",
        label,
        amountCents: s.amountCents,
        invoiceDate: journalDate,
        accountingPeriodStart: s.periodStart,
        accountingPeriodEnd: s.periodEnd,
        splitGroupId,
      }));
      onAppendOtherLines(newLines);
    } else {
      onAppendOtherLines([
        {
          clientId: newClientId(),
          kind: "expense",
          category: "expense_other",
          label,
          amountCents: cents,
        },
      ]);
    }
    resetForm();
  };

  const handleAdd = () => {
    if (expenseKind === "fixed") void addFixedItem();
    else addJournalItem();
  };

  const removeFixedItem = async (id: string) => {
    if (!actorId) return;
    setError("");
    try {
      const res = await fetch("/api/accounting/fixed-expenses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          _actorEducatorId: actorId,
          editPassword: getEditPassword?.(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await loadFixedItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const fixedDisplayGroups = useMemo(() => {
    const map = new Map<string, FixedExpenseEntry[]>();
    for (const item of fixedItems) {
      const key = item.splitGroupId ?? item.id;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, group]) => ({
      key: `fixed-${key}`,
      group,
      total: group.reduce((s, i) => s + i.amountCents, 0),
    }));
  }, [fixedItems]);

  const otherDisplayGroups = useMemo(() => {
    const map = new Map<string, OtherExpenseDraftLine[]>();
    for (const line of otherExpenseLines) {
      const key = line.splitGroupId ?? line.clientId;
      const list = map.get(key) ?? [];
      list.push(line);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, group]) => ({
      key: `journal-${key}`,
      group,
      total: group.reduce((s, l) => s + l.amountCents, 0),
    }));
  }, [otherExpenseLines]);

  const hasAny =
    fixedDisplayGroups.length > 0 || otherDisplayGroups.length > 0;
  const canAdd =
    amount.trim() &&
    !adding &&
    (expenseKind === "fixed"
      ? Boolean(resolvedFixedLabel)
      : Boolean(journalLabel.trim() || amount.trim())) &&
    (!splitAcrossMonths || (coverageValid && splitPreview.length > 0));

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold text-lg text-slate-800">Dépenses</h2>
        <p className="text-sm text-slate-600 mt-1">
          Dépenses <strong>fixes</strong> (liste Excel) et <strong>variables</strong>, saisies à
          la <strong>date de la facture</strong> (jour sélectionné). Répartition
          sur plusieurs mois possible (prorata des jours entre date début et fin
          de la facture).
        </p>
      </div>

      <fieldset disabled={readOnly} className="space-y-4 min-w-0 border-0 p-0 m-0">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50">
            <input
              type="radio"
              name="expense-kind"
              checked={expenseKind === "fixed"}
              onChange={() => setExpenseKind("fixed")}
            />
            Fixe
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50">
            <input
              type="radio"
              name="expense-kind"
              checked={expenseKind === "journal"}
              onChange={() => setExpenseKind("journal")}
            />
            Variable
          </label>
        </div>

        {expenseKind === "fixed" ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <label className="text-sm block sm:col-span-2">
              <span className="text-slate-600">Dépense</span>
              <select
                className="input-field mt-1"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="">— Choisir dans la liste —</option>
                {FIXED_EXPENSE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value={FIXED_EXPENSE_CUSTOM_OPTION}>
                  Autre (saisir)…
                </option>
              </select>
            </label>
            {pick === FIXED_EXPENSE_CUSTOM_OPTION && (
              <label className="text-sm block sm:col-span-2">
                <span className="text-slate-600">Libellé</span>
                <input
                  className="input-field mt-1"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Description"
                />
              </label>
            )}
            <label className="text-sm block">
              <span className="text-slate-600">Responsable</span>
              <input
                className="input-field mt-1"
                placeholder="Ex. Kamar…"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <label className="text-sm block max-w-md">
            <span className="text-slate-600">Description</span>
            <input
              className="input-field mt-1"
              value={journalLabel}
              onChange={(e) => setJournalLabel(e.target.value)}
              placeholder="Ex. épicerie, fournitures…"
            />
          </label>
        )}

        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm w-36">
            <span className="text-slate-600">Montant total ($)</span>
            <input
              className="input-field mt-1"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {expenseKind === "fixed" && (
            <label className="text-sm flex-1 min-w-[160px]">
              <span className="text-slate-600">Note</span>
              <input
                className="input-field mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={splitAcrossMonths}
            onChange={(e) => setSplitAcrossMonths(e.target.checked)}
          />
          <span>
            Répartir sur plusieurs mois (montant au prorata des jours entre début
            et fin de facture)
          </span>
        </label>

        {splitAcrossMonths && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm block">
                <span className="text-slate-600">Début de la facture</span>
                <input
                  type="date"
                  className="input-field mt-1"
                  value={coverageStart}
                  onChange={(e) => setCoverageStart(e.target.value)}
                />
              </label>
              <label className="text-sm block">
                <span className="text-slate-600">Fin de la facture</span>
                <input
                  type="date"
                  className="input-field mt-1"
                  value={coverageEnd}
                  onChange={(e) => setCoverageEnd(e.target.value)}
                />
              </label>
            </div>
            {splitPreview.length > 0 && (
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-medium text-slate-700">Aperçu de la répartition</p>
                <ul className="space-y-0.5">
                  {splitPreview.map((s) => (
                    <li key={`${s.periodStart}-${s.periodEnd}`}>
                      {formatSegmentPeriod(s.periodStart, s.periodEnd)} —{" "}
                      <strong>{s.sharePercent} %</strong> ({s.dayCount} j) :{" "}
                      <strong>{formatCad(s.amountCents)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {splitAcrossMonths && amount.trim() && coverageValid && splitPreview.length === 0 && (
              <p className="text-xs text-amber-700">
                Vérifiez les dates et le montant pour voir l&apos;aperçu.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          className="btn-secondary"
          disabled={readOnly || !canAdd}
          onClick={handleAdd}
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </button>
      </fieldset>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loadingFixed && !hasAny && (
        <p className="text-sm text-slate-500">Chargement…</p>
      )}
      {!loadingFixed && !hasAny && (
        <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl p-4">
          Aucune dépense pour cette date de facture. Les dépenses journal non
          enregistrées disparaissent si vous quittez sans sauvegarder le jour.
        </p>
      )}

      {hasAny && (
        <ul className="divide-y divide-slate-100 text-sm space-y-0 rounded-xl border border-slate-200 overflow-hidden">
          {fixedDisplayGroups.map(({ key, group, total }) => {
            const isSplit =
              group.length > 1 || Boolean(group[0]?.splitGroupId);
            return (
              <li key={key} className="px-3 py-3 bg-rose-50/30">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex gap-2">
                    <OriginBadge kind="fixed" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {group[0]?.label}
                        {isSplit ? (
                          <span className="ml-2 text-xs font-normal text-primary-700">
                            répartie · {formatCad(total)} au total
                          </span>
                        ) : (
                          <>
                            {" "}
                            — <strong>{formatCad(total)}</strong>
                          </>
                        )}
                      </p>
                      {group[0]?.sourceName && (
                        <p className="text-slate-500 text-xs mt-0.5">
                          {group[0].sourceName}
                        </p>
                      )}
                      {isSplit && (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                          {group.map((f) => (
                            <li key={f.id}>
                              {formatSegmentPeriod(f.periodStart, f.periodEnd)} :{" "}
                              <strong>{formatCad(f.amountCents)}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                      {group[0]?.note && !isSplit && (
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {group[0].note}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-rose-600 p-2 shrink-0"
                    onClick={() => removeFixedItem(group[0]!.id)}
                    title={
                      isSplit
                        ? "Supprimer toute la facture répartie"
                        : "Supprimer"
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
          {otherDisplayGroups.map(({ key, group, total }) => {
            const isSplit =
              group.length > 1 || Boolean(group[0]?.splitGroupId);
            return (
              <li key={key} className="px-3 py-3 bg-rose-50/20">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex gap-2">
                    <OriginBadge kind="journal" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {group[0]?.label}
                        {isSplit ? (
                          <span className="ml-2 text-xs font-normal text-primary-700">
                            répartie · {formatCad(total)} au total
                          </span>
                        ) : (
                          <>
                            {" "}
                            — <strong>{formatCad(total)}</strong>
                          </>
                        )}
                      </p>
                      {isSplit && (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                          {group.map((l) => (
                            <li key={l.clientId}>
                              {formatSegmentPeriod(
                                l.accountingPeriodStart ?? journalDate,
                                l.accountingPeriodEnd ?? journalDate
                              )}{" "}
                              : <strong>{formatCad(l.amountCents)}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!isSplit && (
                        <span className="text-xs text-slate-500">
                          Enregistrer le journal pour confirmer
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-rose-600 p-2 shrink-0"
                    onClick={() => onRemoveOtherLine(group[0]!.clientId)}
                    title={
                      isSplit
                        ? "Supprimer toute la dépense répartie"
                        : "Supprimer"
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasAny && (
        <p className="text-sm text-right text-slate-600">
          Total dépenses ce jour :{" "}
          <strong className="text-rose-700">
            {formatCad(fixedTotal + otherTotal)}
          </strong>
        </p>
      )}
    </section>
  );
}
