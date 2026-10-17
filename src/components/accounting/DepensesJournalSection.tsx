"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FixedExpenseEntry, JournalLine } from "@/types";
import {
  FIXED_EXPENSE_CUSTOM_OPTION,
  FIXED_EXPENSE_SUGGESTIONS,
} from "@/lib/fixed-expense-catalog";
import {
  defaultSplitMonthKeys,
  formatMonthLabel,
  isValidMonthKey,
  monthBounds,
  monthKeyFromDate,
  sortMonthKeys,
  splitAmountCents,
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

function monthOptionsAround(anchorDate: string, span = 14): string[] {
  const base = monthKeyFromDate(anchorDate);
  const [y, mo] = base.split("-").map(Number);
  const out: string[] = [];
  for (let i = -2; i < span; i++) {
    const d = new Date(y, mo - 1 + i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return out;
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
      {kind === "fixed" ? "Fixe" : "Journal"}
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
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() =>
    defaultSplitMonthKeys(journalDate, 3)
  );

  const monthChoices = useMemo(
    () => monthOptionsAround(journalDate),
    [journalDate]
  );

  useEffect(() => {
    setSelectedMonths(defaultSplitMonthKeys(journalDate, 3));
  }, [journalDate]);

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

  const toggleMonth = (key: string) => {
    setSelectedMonths((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((m) => m !== key);
        return next.length > 0 ? next : prev;
      }
      return sortMonthKeys([...prev, key]);
    });
  };

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
    if (splitAcrossMonths && selectedMonths.length < 2) {
      setError("Choisissez au moins 2 mois pour une répartition.");
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
        payload.allocateToMonths = selectedMonths.filter(isValidMonthKey);
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
    if (splitAcrossMonths && selectedMonths.length < 2) {
      setError("Choisissez au moins 2 mois pour une répartition.");
      return;
    }
    setError("");
    if (splitAcrossMonths) {
      const months = sortMonthKeys(selectedMonths.filter(isValidMonthKey));
      const parts = splitAmountCents(cents, months.length);
      const splitGroupId = newClientId();
      const newLines: OtherExpenseDraftLine[] = months.map((m, i) => {
        const bounds = monthBounds(m);
        return {
          clientId: newClientId(),
          kind: "expense",
          category: "expense_other",
          label,
          amountCents: parts[i]!,
          invoiceDate: journalDate,
          accountingPeriodStart: bounds.periodStart,
          accountingPeriodEnd: bounds.periodEnd,
          splitGroupId,
        };
      });
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
    (!splitAcrossMonths || selectedMonths.length >= 2);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold text-lg text-slate-800">Dépenses</h2>
        <p className="text-sm text-slate-600 mt-1">
          Dépenses fixes (liste Excel) et autres dépenses du journal, saisies à
          la <strong>date de la facture</strong> (jour sélectionné). Répartition
          sur plusieurs mois possible : chaque tranche entre dans l&apos;analyse
          du mois choisi.
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
            Dépense fixe
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50">
            <input
              type="radio"
              name="expense-kind"
              checked={expenseKind === "journal"}
              onChange={() => setExpenseKind("journal")}
            />
            Autre dépense (journal)
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
            Répartir sur plusieurs mois (montant divisé entre les mois cochés)
          </span>
        </label>

        {splitAcrossMonths && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Mois comptables concernés
            </p>
            <div className="flex flex-wrap gap-2">
              {monthChoices.map((m) => (
                <label
                  key={m}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer touch-manipulation ${
                    selectedMonths.includes(m)
                      ? "border-primary-400 bg-primary-50 text-primary-900"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={selectedMonths.includes(m)}
                    onChange={() => toggleMonth(m)}
                  />
                  {formatMonthLabel(m)}
                </label>
              ))}
            </div>
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
                              {formatMonthLabel(f.periodStart.slice(0, 7))} :{" "}
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
                              {formatMonthLabel(
                                (l.accountingPeriodStart ?? journalDate).slice(
                                  0,
                                  7
                                )
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
