"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parseVacationDate } from "@/lib/vacation-dates";

type DayEntry = { educatorId: string; educatorName: string };

export function VacationStaffCalendar({ actorId }: { actorId: string }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [days, setDays] = useState<Record<string, DayEntry[]>>({});
  const [overCapacityDays, setOverCapacityDays] = useState<
    { date: string; educatorNames: string[]; count: number; limit: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const monthKey = format(month, "yyyy-MM");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/vacations/calendar?month=${monthKey}&_actorEducatorId=${encodeURIComponent(actorId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de charger le calendrier");
        setDays({});
        return;
      }
      setDays(data.days ?? {});
      setOverCapacityDays(data.overCapacityDays ?? []);
    } catch {
      setError("Erreur de connexion");
      setDays({});
    } finally {
      setLoading(false);
    }
  }, [monthKey, actorId]);

  useEffect(() => {
    load();
  }, [load]);

  const grid = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const allDays = eachDayOfInterval({ start, end });
    const pad = (start.getDay() + 6) % 7;
    return { allDays, pad };
  }, [month]);

  const weekdayLabels = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-800 capitalize">
          {format(month, "MMMM yyyy", { locale: fr })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 touch-manipulation"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="rounded-lg px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 touch-manipulation"
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 touch-manipulation"
            aria-label="Mois suivant"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-rose-600">{error}</p>
      )}

      {overCapacityDays.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950">
          <p className="font-medium">
            Attention : certains jours dépassent la limite de congés simultanés
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {overCapacityDays.map((o) => (
              <li key={o.date}>
                {format(parseVacationDate(o.date), "d MMM yyyy", {
                  locale: fr,
                })}{" "}
                : {o.count} personnes ({o.educatorNames.join(", ")}) — maximum{" "}
                {o.limit}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-rose-800">
            Cela arrive si des congés ont été acceptés dans un ordre qui ne
            respectait pas encore toutes les vérifications. Corrigez en annulant
            ou en ajustant une demande.
          </p>
        </div>
      )}

      <div className="grid grid-cols-7 gap-px rounded-xl border border-slate-200 bg-slate-200 overflow-hidden text-xs sm:text-sm">
        {weekdayLabels.map((w) => (
          <div
            key={w}
            className="bg-slate-50 px-1 py-2 text-center font-medium text-slate-600"
          >
            {w}
          </div>
        ))}
        {Array.from({ length: grid.pad }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-[4.5rem] bg-white" />
        ))}
        {grid.allDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const entries = days[key] ?? [];
          const inMonth = isSameMonth(day, month);
          const overCap = overCapacityDays.some((o) => o.date === key);
          return (
            <div
              key={key}
              className={`min-h-[4.5rem] sm:min-h-[5.5rem] p-1 sm:p-1.5 ${
                overCap ? "bg-rose-50 ring-1 ring-inset ring-rose-300" : "bg-white"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <div className="mb-0.5 text-right text-[11px] sm:text-xs font-medium text-slate-500">
                {format(day, "d")}
              </div>
              <ul className="space-y-0.5">
                {entries.map((e) => (
                  <li
                    key={`${key}-${e.educatorId}`}
                    className="truncate rounded bg-emerald-100 px-1 py-0.5 text-[10px] sm:text-xs text-emerald-900"
                    title={e.educatorName}
                  >
                    {e.educatorName.split(" ")[0]}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {loading && (
        <p className="mt-3 text-center text-sm text-slate-500">Chargement…</p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Seuls les congés <strong>acceptés</strong> apparaissent. Les demandes en
        attente ou refusées ne sont pas affichées.
      </p>
    </div>
  );
}
