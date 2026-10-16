"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FixedExpenseEntry } from "@/types";
import {
  FIXED_EXPENSE_CUSTOM_OPTION,
  FIXED_EXPENSE_SUGGESTIONS,
} from "@/lib/fixed-expense-catalog";
import {
  defaultSplitMonthKeys,
  formatMonthLabel,
  isValidMonthKey,
  monthKeyFromDate,
} from "@/lib/fixed-expense-split";
import { formatCad } from "@/lib/money";

type Props = {
  actorId: string | null;
  journalDate: string;
  onTotalCentsChange?: (totalCents: number) => void;
  readOnly?: boolean;
  getEditPassword?: () => string | undefined;
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

export function FixedExpensesJournalSection({
  actorId,
  journalDate,
  onTotalCentsChange,
  readOnly = false,
  getEditPassword,
}: Props) {
  const [items, setItems] = useState<FixedExpenseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const [pick, setPick] = useState<string>("");
  const [customLabel, setCustomLabel] = useState("");
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

  const resolvedLabel =
    pick === FIXED_EXPENSE_CUSTOM_OPTION
      ? customLabel.trim()
      : pick.trim();

  const loadItems = useCallback(async () => {
    if (!actorId || !journalDate) {
      setItems([]);
      onTotalCentsChange?.(0);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        journalDay: journalDate,
        _actorEducatorId: actorId,
      });
      const res = await fetch(`/api/accounting/fixed-expenses?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      const list = (data.items ?? []) as FixedExpenseEntry[];
      setItems(list);
      const total = list.reduce((s, i) => s + i.amountCents, 0);
      onTotalCentsChange?.(total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setItems([]);
      onTotalCentsChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [actorId, journalDate, onTotalCentsChange]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const toggleMonth = (key: string) => {
    setSelectedMonths((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((m) => m !== key);
        return next.length > 0 ? next : prev;
      }
      return [...prev, key].sort();
    });
  };

  const addItem = async () => {
    if (!actorId || !journalDate || !resolvedLabel) return;
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
        label: resolvedLabel,
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
      setAmount("");
      setNote("");
      setCustomLabel("");
      setPick("");
      setSplitAcrossMonths(false);
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAdding(false);
    }
  };

  const removeItem = async (id: string) => {
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
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const displayGroups = useMemo(() => {
    const map = new Map<string, FixedExpenseEntry[]>();
    for (const item of items) {
      const key = item.splitGroupId ?? item.id;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, group]) => ({
      key,
      group,
      total: group.reduce((s, i) => s + i.amountCents, 0),
    }));
  }, [items]);

  const dayTotal = items.reduce((s, i) => s + i.amountCents, 0);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold text-lg text-slate-800">
          5 — Dépenses fixes
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Saisie à la <strong>date de la facture</strong> (jour du journal).
          Vous pouvez répartir une facture sur plusieurs mois : chaque tranche
          entre dans l&apos;<strong>analyse de période</strong> du mois choisi,
          pas seulement la date de facture.
        </p>
      </div>

      <fieldset disabled={readOnly} className="space-y-4 min-w-0 border-0 p-0 m-0">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <label className="text-sm block sm:col-span-2">
            <span className="text-slate-600">Dépense</span>
            <select
              className="input-field mt-1"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={readOnly}
            >
              <option value="">— Choisir dans la liste —</option>
              {FIXED_EXPENSE_SUGGESTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={FIXED_EXPENSE_CUSTOM_OPTION}>Autre (saisir)…</option>
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
            <span className="text-slate-600">Montant total facture ($)</span>
            <input
              className="input-field mt-1"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="text-sm block">
            <span className="text-slate-600">Responsable</span>
            <input
              className="input-field mt-1"
              placeholder="Ex. Kamar, Sara…"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
            />
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={splitAcrossMonths}
            onChange={(e) => setSplitAcrossMonths(e.target.checked)}
          />
          <span>
            Répartir cette facture sur plusieurs mois (montant divisé
            également entre les mois cochés)
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

        <label className="text-sm block">
          <span className="text-slate-600">Note</span>
          <input
            className="input-field mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-secondary"
          disabled={readOnly || adding || !resolvedLabel || !amount.trim()}
          onClick={addItem}
        >
          <Plus className="h-4 w-4" />
          Ajouter la dépense fixe
        </button>
      </fieldset>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading && items.length === 0 && (
        <p className="text-sm text-slate-500">Chargement…</p>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl p-4">
          Aucune dépense fixe enregistrée pour cette date de facture.
        </p>
      )}
      {displayGroups.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100 text-sm space-y-0">
            {displayGroups.map(({ key, group, total }) => {
              const isSplit = group.length > 1 || Boolean(group[0]?.splitGroupId);
              return (
                <li key={key} className="py-3">
                  <div className="flex justify-between items-start gap-2">
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
                        <ul className="mt-2 space-y-1 text-xs text-slate-600">
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
                    <button
                      type="button"
                      className="text-rose-600 p-2 shrink-0"
                      onClick={() => removeItem(group[0]!.id)}
                      aria-label="Supprimer"
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
          </ul>
          <p className="text-sm text-right text-slate-600">
            Total factures saisies ce jour :{" "}
            <strong className="text-rose-700">{formatCad(dayTotal)}</strong>
          </p>
        </>
      )}
    </section>
  );
}
