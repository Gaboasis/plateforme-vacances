"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Banknote, Minus, Plus, RefreshCw } from "lucide-react";
import type { PettyCashTransaction } from "@/types";
import { formatCad } from "@/lib/money";
import {
  computePettyCashBalanceCents,
  pettyCashSignedDelta,
} from "@/lib/petty-cash-utils";

type Props = {
  actorId: string | null;
};

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

export function PetiteCaissePanel({ actorId }: Props) {
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([]);
  const [balanceCents, setBalanceCents] = useState(0);
  const [openingBalanceCents, setOpeningBalanceCents] = useState(193_055);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayIso);
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!actorId) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ _actorEducatorId: actorId });
      const res = await fetch(`/api/accounting/petty-cash?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      const opening =
        typeof data.openingBalanceCents === "number"
          ? data.openingBalanceCents
          : 193_055;
      setOpeningBalanceCents(opening);
      setBalanceCents(
        typeof data.balanceCents === "number"
          ? data.balanceCents
          : opening +
              computePettyCashBalanceCents(data.transactions ?? [])
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setTransactions([]);
      setBalanceCents(0);
    } finally {
      setLoading(false);
    }
  }, [actorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rowsWithBalance = useMemo(() => {
    const asc = [...transactions].sort((a, b) => {
      const d = a.transactionDate.localeCompare(b.transactionDate);
      if (d !== 0) return d;
      return a.createdAt.localeCompare(b.createdAt);
    });
    let running = openingBalanceCents;
    const balanceAfter = new Map<string, number>();
    for (const t of asc) {
      running += pettyCashSignedDelta(t.direction, t.amountCents);
      balanceAfter.set(t.id, running);
    }
    return transactions.map((t) => ({
      ...t,
      balanceAfterCents: balanceAfter.get(t.id) ?? balanceCents,
    }));
  }, [transactions, balanceCents, openingBalanceCents]);

  const submit = async (direction: "in" | "out", amountRaw: string) => {
    if (!actorId) return;
    const trimmed = amountRaw.trim();
    if (!trimmed) {
      setError("Indiquez un montant.");
      return;
    }
    if (direction === "out") {
      const preview = parseFloat(trimmed.replace(",", "."));
      if (Number.isFinite(preview) && preview * 100 > balanceCents + 0.01) {
        const ok = window.confirm(
          "Ce retrait dépasse le solde affiché. Enregistrer quand même ?"
        );
        if (!ok) return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/accounting/petty-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          amountDollars: trimmed,
          transactionDate,
          note: note.trim() || undefined,
          _actorEducatorId: actorId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible");
      if (typeof data.openingBalanceCents === "number") {
        setOpeningBalanceCents(data.openingBalanceCents);
      }
      if (typeof data.balanceCents === "number") {
        setBalanceCents(data.balanceCents);
      }
      if (data.transaction) {
        setTransactions((prev) => [data.transaction as PettyCashTransaction, ...prev]);
      } else {
        await load();
      }
      if (direction === "in") setAmountIn("");
      else setAmountOut("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="card space-y-4">
        <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary-500" />
          Petite caisse
        </h2>
        <p className="text-sm text-slate-600">
          Tracez chaque <strong>ajout</strong> (+) ou <strong>retrait</strong> (−) d&apos;argent
          en caisse. Solde de départ :{" "}
          <strong>{formatCad(openingBalanceCents)}</strong>.
        </p>

        <div className="rounded-xl bg-slate-100 border border-slate-200 px-5 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Solde actuel
          </p>
          <p
            className={`text-3xl font-bold tabular-nums mt-1 ${
              balanceCents >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {formatCad(balanceCents)}
          </p>
        </div>

        <label className="text-sm block max-w-xs">
          <span className="text-slate-600">Date du mouvement</span>
          <input
            type="date"
            className="input-field mt-1"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
        </label>

        <label className="text-sm block">
          <span className="text-slate-600">Note (optionnel)</span>
          <input
            className="input-field mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. achat fournitures, remboursement…"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
            <p className="text-sm font-semibold text-emerald-900 flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Ajouter à la caisse
            </p>
            <label className="text-sm block">
              <span className="text-slate-600">Montant ($)</span>
              <input
                className="input-field mt-1"
                inputMode="decimal"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={submitting || !actorId}
              onClick={() => void submit("in", amountIn)}
            >
              Enregistrer l&apos;ajout
            </button>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-3">
            <p className="text-sm font-semibold text-rose-900 flex items-center gap-1">
              <Minus className="h-4 w-4" />
              Retirer de la caisse
            </p>
            <label className="text-sm block">
              <span className="text-slate-600">Montant ($)</span>
              <input
                className="input-field mt-1"
                inputMode="decimal"
                value={amountOut}
                onChange={(e) => setAmountOut(e.target.value)}
                placeholder="0,00"
              />
            </label>
            <button
              type="button"
              className="btn-secondary w-full border-rose-200 text-rose-800 hover:bg-rose-50"
              disabled={submitting || !actorId}
              onClick={() => void submit("out", amountOut)}
            >
              Enregistrer le retrait
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button
          type="button"
          className="btn-secondary text-sm"
          disabled={loading || !actorId}
          onClick={() => void load()}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold text-slate-800">Historique</h3>
        {loading && transactions.length === 0 ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : rowsWithBalance.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun mouvement enregistré.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2 text-right">Montant</th>
                  <th className="py-2 px-2 text-right">Solde après</th>
                  <th className="py-2 px-2">Note</th>
                  <th className="py-2 px-2">Par</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithBalance.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 align-top">
                    <td className="py-2 px-2 whitespace-nowrap">
                      {format(parseISO(t.transactionDate), "d MMM yyyy", {
                        locale: fr,
                      })}
                    </td>
                    <td className="py-2 px-2">
                      {t.direction === "in" ? (
                        <span className="text-emerald-700 font-medium">+ Ajout</span>
                      ) : (
                        <span className="text-rose-700 font-medium">− Retrait</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-medium tabular-nums">
                      {t.direction === "in" ? "+" : "−"}
                      {formatCad(t.amountCents)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                      {formatCad(t.balanceAfterCents)}
                    </td>
                    <td className="py-2 px-2 text-slate-600 max-w-[160px] truncate">
                      {t.note ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-slate-500 whitespace-nowrap">
                      {t.createdByName}
                    </td>
                  </tr>
                ))}
                {openingBalanceCents > 0 && (
                  <tr className="border-t border-slate-200 bg-slate-50/80 text-slate-600">
                    <td className="py-2 px-2">—</td>
                    <td className="py-2 px-2 font-medium">Solde initial</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      +{formatCad(openingBalanceCents)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">
                      {formatCad(openingBalanceCents)}
                    </td>
                    <td className="py-2 px-2">Ouverture</td>
                    <td className="py-2 px-2">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
