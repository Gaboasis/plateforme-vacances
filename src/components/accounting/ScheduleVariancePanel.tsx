"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { ScheduleVariance } from "@/lib/compare-schedule-actual";

type Props = {
  variances: ScheduleVariance[];
  scheduleLabel?: string;
  journalDateLabel?: string;
  loading?: boolean;
};

const SEVERITY: Record<
  ScheduleVariance["kind"],
  "ok" | "warn" | "info"
> = {
  late: "warn",
  early_departure: "warn",
  overtime_end: "info",
  absence_but_worked: "warn",
  vacation_but_worked: "warn",
  expected_work_missing: "info",
  unexpected_work: "info",
  no_schedule: "info",
};

export function ScheduleVariancePanel({
  variances,
  scheduleLabel,
  journalDateLabel,
  loading,
}: Props) {
  if (loading) {
    return (
      <p className="text-sm text-slate-500 flex items-center gap-2">
        <Clock className="h-4 w-4 animate-pulse" />
        Chargement de l&apos;horaire prévu…
      </p>
    );
  }

  if (!scheduleLabel) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        Aucun horaire hebdomadaire importé pour cette date. Déposez un PDF dans
        l&apos;onglet <strong>Horaires</strong>.
      </p>
    );
  }

  if (variances.length === 0) {
    return (
      <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Conforme à l&apos;horaire ({scheduleLabel}) pour les heures saisies.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Écart horaire
        {journalDateLabel ? ` · ${journalDateLabel}` : ""}
        {scheduleLabel ? ` · semaine ${scheduleLabel}` : ""}
      </p>
      <ul className="space-y-1.5">
        {variances.map((v, i) => {
          const sev = SEVERITY[v.kind];
          const cls =
            sev === "warn"
              ? "text-amber-900 bg-amber-50 border-amber-100"
              : sev === "info"
                ? "text-slate-800 bg-white border-slate-100"
                : "text-emerald-800 bg-emerald-50";
          return (
            <li
              key={`${v.educatorId}-${v.kind}-${i}`}
              className={`text-sm rounded-lg border px-3 py-2 flex gap-2 ${cls}`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
              <span>
                <strong>{v.educatorName}</strong> — {v.message}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
