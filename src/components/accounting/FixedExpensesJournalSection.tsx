"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { FixedExpenseEntry } from "@/types";
import {
  FIXED_EXPENSE_CUSTOM_OPTION,
  FIXED_EXPENSE_SUGGESTIONS,
} from "@/lib/fixed-expense-catalog";
import { formatCad } from "@/lib/money";

type Props = {
  actorId: string | null;
  journalDate: string;
  onTotalCentsChange?: (totalCents: number) => void;
};

export function FixedExpensesJournalSection({
  actorId,
  journalDate,
  onTotalCentsChange,
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
        from: journalDate,
        to: journalDate,
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

  const addItem = async () => {
    if (!actorId || !journalDate || !resolvedLabel) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/accounting/fixed-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: journalDate,
          periodEnd: journalDate,
          label: resolvedLabel,
          amountDollars: amount,
          sourceName,
          note,
          _actorEducatorId: actorId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setAmount("");
      setNote("");
      setCustomLabel("");
      setPick("");
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
        body: JSON.stringify({ id, _actorEducatorId: actorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      await loadItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  };

  const dayTotal = items.reduce((s, i) => s + i.amountCents, 0);

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold text-lg text-slate-800">
          5 — Dépenses fixes
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Postes du budget Excel (prêt, hydro, Bell, etc.) enregistrés pour{" "}
          <strong>cette date</strong>. Ils sont inclus dans l&apos;analyse de
          période automatiquement.
        </p>
      </div>

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
          <span className="text-slate-600">Montant ($)</span>
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
        disabled={adding || !resolvedLabel || !amount.trim()}
        onClick={addItem}
      >
        <Plus className="h-4 w-4" />
        Ajouter la dépense fixe
      </button>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading && items.length === 0 && (
        <p className="text-sm text-slate-500">Chargement…</p>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl p-4">
          Aucune dépense fixe pour ce jour.
        </p>
      )}
      {items.length > 0 && (
        <>
          <ul className="divide-y divide-slate-100 text-sm">
            {items.map((f) => (
              <li
                key={f.id}
                className="flex justify-between items-start gap-2 py-2"
              >
                <span>
                  {f.label} — <strong>{formatCad(f.amountCents)}</strong>
                  {f.sourceName && (
                    <span className="text-slate-500"> ({f.sourceName})</span>
                  )}
                  {f.note && (
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {f.note}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-rose-600 p-2 shrink-0"
                  onClick={() => removeItem(f.id)}
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-right text-slate-600">
            Sous-total fixes :{" "}
            <strong className="text-rose-700">{formatCad(dayTotal)}</strong>
          </p>
        </>
      )}
    </section>
  );
}
