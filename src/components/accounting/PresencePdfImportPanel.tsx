"use client";

import { useCallback, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { FileUp, Loader2 } from "lucide-react";
import type { PresenceParseResult } from "@/lib/parse-presence-pdf";

type Props = {
  actorId: string | null;
  selectedDate: string;
  readOnly: boolean;
  onApplyHours: (result: PresenceParseResult) => void;
};

export function PresencePdfImportPanel({
  actorId,
  selectedDate,
  readOnly,
  onApplyHours,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PresenceParseResult | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!actorId || readOnly) return;
      setError("");
      setPreview(null);
      setLoading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("_actorEducatorId", actorId);
        const res = await fetch("/api/accounting/parse-presence-pdf", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur");
        setPreview(data as PresenceParseResult);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      } finally {
        setLoading(false);
      }
    },
    [actorId, readOnly]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const applyPreview = () => {
    if (!preview) return;
    if (preview.rows.length === 0) {
      setError("Aucune éducatrice reconnue dans le PDF.");
      return;
    }
    onApplyHours(preview);
    setPreview(null);
  };

  return (
    <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/40 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
          <FileUp className="h-4 w-4 text-primary-600" />
          Importer « Historique des présences » (PDF)
        </p>
        <p className="text-xs text-slate-600 mt-1">
          Déposez le PDF exporté de GAB (comme celui reçu par courriel). Les heures
          sont calculées du début à la fin, arrondies au quart d&apos;heure.
        </p>
      </div>

      <div
        role="button"
        tabIndex={readOnly ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!readOnly) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !readOnly && inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          readOnly
            ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
            : dragOver
              ? "border-primary-500 bg-primary-50 cursor-copy"
              : "border-slate-200 bg-white hover:border-primary-300 cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={readOnly || loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
            e.target.value = "";
          }}
        />
        {loading ? (
          <p className="text-sm text-slate-600 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Lecture du PDF…
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            {readOnly
              ? "Déverrouillez la journée pour importer un PDF."
              : "Glissez le PDF ici ou cliquez pour choisir un fichier"}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 text-sm">
          <p className="font-medium text-slate-800">
            Aperçu —{" "}
            {preview.journalDate
              ? format(parseISO(preview.journalDate), "d MMMM yyyy", { locale: fr })
              : "date inconnue"}
            {preview.journalDate && preview.journalDate !== selectedDate && (
              <span className="text-amber-700 font-normal ml-2">
                (jour actuel : {selectedDate})
              </span>
            )}
          </p>
          <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100">
            {preview.rows.map((r) => (
              <li key={r.educatorId} className="py-1 flex justify-between gap-2">
                <span>
                  {r.educatorName}{" "}
                  <span className="text-slate-400 text-xs">({r.pdfName})</span>
                </span>
                <span className="whitespace-nowrap">
                  {r.startTime}–{r.endTime} → <strong>{r.hours} h</strong>
                </span>
              </li>
            ))}
          </ul>
          {preview.unmatchedPdfNames.length > 0 && (
            <p className="text-xs text-amber-800">
              Non reconnues sur la plateforme :{" "}
              {preview.unmatchedPdfNames.join(", ")}
            </p>
          )}
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={applyPreview}>
            Appliquer les heures au journal
          </button>
        </div>
      )}
    </div>
  );
}
