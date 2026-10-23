"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Trash2, Upload } from "lucide-react";
import type { WeeklyScheduleSummary } from "@/lib/store-weekly-schedule";

type Props = {
  actorId: string | null;
};

export function WeeklyScheduleAdminPanel({ actorId }: Props) {
  const [schedules, setSchedules] = useState<WeeklyScheduleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!actorId) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ _actorEducatorId: actorId });
      const res = await fetch(`/api/admin/weekly-schedule?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [actorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = async (scheduleId: string, label: string) => {
    if (!actorId) return;
    if (
      !window.confirm(
        `Supprimer l'horaire ${label} ? Vous pourrez redéposer le PDF ensuite.`
      )
    ) {
      return;
    }
    setDeletingId(scheduleId);
    setError("");
    setSuccess("");
    try {
      const q = new URLSearchParams({
        _actorEducatorId: actorId,
        id: scheduleId,
      });
      const res = await fetch(`/api/admin/weekly-schedule?${q}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suppression impossible");
      setSuccess(`Horaire ${label} supprimé. Vous pouvez importer un nouveau PDF.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeletingId(null);
    }
  };

  const onFile = async (file: File) => {
    if (!actorId) return;
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("_actorEducatorId", actorId);
      const res = await fetch("/api/admin/weekly-schedule", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import impossible");
      const unmatched = Array.isArray(data.unmatchedPdfNames)
        ? data.unmatchedPdfNames
        : [];
      setSuccess(
        `Horaire enregistré (${data.schedule?.periodStart} → ${data.schedule?.periodEnd}). ` +
          `${data.matchedEntryCount ?? 0} entrée(s) liée(s) aux profils.` +
          (unmatched.length > 0
            ? ` Non reconnus : ${unmatched.slice(0, 4).join(", ")}${unmatched.length > 4 ? "…" : ""}.`
            : "")
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="card space-y-4">
        <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary-500" />
          Horaire hebdomadaire (PDF)
        </h2>
        <p className="text-sm text-slate-600">
          Déposez le PDF <strong>Horaire employé</strong> (export GAB, ex.{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">Horaire_employe_YYYY-MM-DD.pdf</code>
          ). Lors de la saisie des heures au journal, l&apos;<strong>admin</strong>{" "}
          verra les <strong>écarts et retards</strong> par rapport à cet horaire.
        </p>

        <label
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer transition ${
            uploading
              ? "border-slate-200 bg-slate-50 opacity-60 pointer-events-none"
              : "border-primary-200 bg-primary-50/30 hover:bg-primary-50/60"
          }`}
        >
          <Upload className="h-8 w-8 text-primary-500" />
          <span className="text-sm font-medium text-slate-700">
            {uploading ? "Import en cours…" : "Glisser le PDF ici ou cliquer"}
          </span>
          <input
            type="file"
            className="sr-only"
            accept="application/pdf,.pdf"
            disabled={uploading || !actorId}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>

        {success && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            {success}
          </p>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold text-slate-800">Horaires importés</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun horaire importé.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {schedules.map((s) => {
              const label = `${s.periodStart} → ${s.periodEnd}`;
              return (
                <li
                  key={s.id}
                  className="py-2 flex flex-wrap justify-between gap-2 items-start"
                >
                  <span>
                    <strong>{label}</strong>
                    {s.sourceFileName && (
                      <span className="text-slate-500 block text-xs">
                        {s.sourceFileName}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-slate-500 text-xs text-right">
                      {s.entryCount} entrées · {s.uploadedByName}
                      <br />
                      {new Date(s.createdAt).toLocaleString("fr-CA")}
                    </span>
                    <button
                      type="button"
                      disabled={deletingId === s.id}
                      onClick={() => void onDelete(s.id, label)}
                      className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === s.id ? "Suppression…" : "Supprimer"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
