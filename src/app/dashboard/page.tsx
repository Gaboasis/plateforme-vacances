"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarPlus, Clock, CheckCircle, XCircle } from "lucide-react";
import type { Educator, VacationRequest } from "@/types";

function UrgentAppealForm({
  requestId,
  educatorId,
  onSuccess,
}: {
  requestId: string;
  educatorId: string;
  onSuccess: (updated: VacationRequest) => void;
}) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setStatus("submitting");
    setError("");
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urgentAppealReason: reason.trim(), educatorId }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        onSuccess(data);
      } else {
        setStatus("error");
        setError(data.error || "Erreur lors de l'envoi");
      }
    } catch {
      setStatus("error");
      setError("Erreur de connexion");
    }
  };

  return (
    <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 sm:p-4">
      <p className="mb-3 text-sm font-medium text-amber-900">
        S&apos;il y a une urgence motivée, décrivez la raison. L&apos;administration
        l&apos;évaluera directement sur la plateforme.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Décès dans la famille, urgence médicale..."
          className="input-field min-h-[80px] resize-none"
          rows={3}
          disabled={status === "submitting" || status === "success"}
        />
        {status === "error" && (
          <p className="text-sm text-rose-600">{error}</p>
        )}
        {status !== "success" && (
          <button
            type="submit"
            disabled={!reason.trim() || status === "submitting"}
            className="btn-primary"
          >
            {status === "submitting" ? "Envoi..." : "Soumettre à l'administration"}
          </button>
        )}
      </form>
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<Educator | null>(null);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "" });
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "pending" | "rejected" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastRejectedContext, setLastRejectedContext] = useState<{
    requestId?: string;
    educatorName: string;
    startDate: string;
    endDate: string;
    reason?: string;
    rejectionReason?: string;
  } | null>(null);
  const [expandedAppealFor, setExpandedAppealFor] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    if (!stored) return;
    const educator = JSON.parse(stored);
    setUser(educator);
    if (educator.role === "admin") {
      window.location.href = "/admin";
      return;
    }
    if (educator.role !== "admin") {
      fetch(`/api/requests?educatorId=${educator.id}`)
        .then((r) => r.json())
        .then(setRequests)
        .finally(() => setLoading(false));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role === "admin") return;
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          educatorId: user.id,
          educatorName: user.name,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok && !data.request) {
        setSubmitStatus("error");
        setErrorMessage(data.error || "Erreur lors de la demande");
        setLastRejectedContext({
          educatorName: user.name,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason || undefined,
          rejectionReason: data.error,
        });
        return;
      }

      if (data.request) {
        setRequests((prev) => [data.request, ...prev]);
      }
      const isRejected = !data.accepted && !data.pending;
      if (isRejected && data.request) {
        setLastRejectedContext({
          requestId: data.request.id,
          educatorName: data.request.educatorName,
          startDate: data.request.startDate,
          endDate: data.request.endDate,
          reason: data.request.reason,
          rejectionReason: data.request.rejectionReason,
        });
      } else {
        setLastRejectedContext(null);
      }
      if (!isRejected) {
        setForm({ startDate: "", endDate: "", reason: "" });
        setShowForm(false);
      }
      setSubmitStatus(
        data.accepted
          ? "success"
          : data.pending
          ? "pending"
          : "rejected"
      );
      if (!data.accepted && !data.pending && data.error)
        setErrorMessage(data.error);
    } catch {
      setSubmitStatus("error");
      setErrorMessage("Erreur de connexion");
    }
  };

  const StatusBadge = ({ status }: { status: VacationRequest["status"] }) => {
    if (status === "accepted")
      return (
        <span className="badge-accepted flex items-center gap-1">
          <CheckCircle className="h-3.5 w-3.5" /> Acceptée
        </span>
      );
    if (status === "rejected")
      return (
        <span className="badge-rejected flex items-center gap-1">
          <XCircle className="h-3.5 w-3.5" /> Refusée
        </span>
      );
    return (
      <span className="badge-pending flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" /> En attente
      </span>
    );
  };

  if (!user) return null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-800">
          Bonjour, {user.name} 👋
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Gérez vos demandes de congés en un clin d&apos;œil
        </p>
      </div>

      {/* Bouton nouvelle demande */}
      {!showForm ? (
        <button
          onClick={() => {
            setShowForm(true);
            setSubmitStatus("idle");
            setErrorMessage("");
            setLastRejectedContext(null);
          }}
          className="btn-primary flex items-center gap-2 w-full sm:w-auto"
        >
          <CalendarPlus className="h-5 w-5 shrink-0" />
          Nouvelle demande
        </button>
      ) : (
        <div className="card rounded-2xl p-4 sm:p-6">
          <h2 className="font-display text-base sm:text-lg font-semibold text-slate-800 mb-4">
            Nouvelle demande de congés
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Date de début
                </label>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Date de fin
                </label>
                <input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Motif (optionnel)
              </label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Ex: Vacances familiales"
                className="input-field min-h-[80px] resize-none"
                rows={3}
              />
            </div>
            {submitStatus === "error" && (
              <p className="text-sm text-rose-600">{errorMessage}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="submit" className="btn-primary flex-1 sm:flex-none">
                Envoyer la demande
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSubmitStatus("idle");
                  setErrorMessage("");
                  setLastRejectedContext(null);
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {submitStatus === "success" && (
        <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800 text-sm">
          ✓ Votre demande a été acceptée automatiquement.
        </div>
      )}
      {submitStatus === "pending" && (
        <div className="rounded-xl bg-amber-50 p-4 text-amber-800 text-sm">
          📋 Votre demande est sous évaluation. L&apos;administrateur vous
          répondra par acceptation ou refus. Actualisez la page pour voir les
          mises à jour.
        </div>
      )}
      {(submitStatus === "rejected" || submitStatus === "error") &&
        lastRejectedContext?.requestId && (
        <div className="space-y-4">
          <div className="rounded-xl bg-rose-50 p-4 text-rose-800 text-sm">
            Votre demande n&apos;a pas pu être acceptée : {errorMessage}
          </div>
          <UrgentAppealForm
            requestId={lastRejectedContext.requestId}
            educatorId={user.id}
            onSuccess={(updated) => {
              setRequests((prev) =>
                prev.map((r) => (r.id === updated.id ? updated : r))
              );
              setLastRejectedContext(null);
              setSubmitStatus("idle");
            }}
          />
        </div>
      )}
      {(submitStatus === "rejected" || submitStatus === "error") &&
        !lastRejectedContext?.requestId && (
        <div className="rounded-xl bg-rose-50 p-4 text-rose-800 text-sm">
          Votre demande n&apos;a pas pu être acceptée : {errorMessage}
        </div>
      )}

      {/* Liste des demandes */}
      <div>
        <h2 className="font-display text-base sm:text-lg font-semibold text-slate-800 mb-4">
          Mes demandes
        </h2>
        {loading ? (
          <div className="card flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : requests.length === 0 ? (
          <div className="card text-center py-12">
            <CalendarPlus className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-slate-500">Aucune demande pour le moment</p>
            <p className="text-sm text-slate-400">
              Cliquez sur &quot;Nouvelle demande&quot; pour commencer
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="card-hover flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 text-sm sm:text-base">
                    {format(parseISO(req.startDate), "d MMM yyyy", { locale: fr })} —{" "}
                    {format(parseISO(req.endDate), "d MMM yyyy", { locale: fr })}
                  </p>
                  {req.reason && (
                    <p className="mt-1 text-sm text-slate-500">{req.reason}</p>
                  )}
                  {req.status === "rejected" && req.rejectionReason && (
                    <p className="mt-2 text-sm text-rose-600">
                      Motif : {req.rejectionReason}
                    </p>
                  )}
                  {req.status === "rejected" && req.urgentAppealReason && !req.appealReviewedAt && (
                    <p className="mt-2 text-sm text-amber-700">
                      Appel soumis, en attente d&apos;évaluation par l&apos;administration
                    </p>
                  )}
                  {req.status === "rejected" && req.appealReviewedAt && (
                    <p className="mt-2 text-sm text-slate-500">
                      Appel refusé par l&apos;administration
                    </p>
                  )}
                  {req.status === "rejected" && !req.urgentAppealReason && user && (
                    <div className="mt-2">
                      {expandedAppealFor === req.id ? (
                        <UrgentAppealForm
                          requestId={req.id}
                          educatorId={user.id}
                          onSuccess={(updated) => {
                            setRequests((prev) =>
                              prev.map((r) => (r.id === updated.id ? updated : r))
                            );
                            setExpandedAppealFor(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpandedAppealFor(req.id)}
                          className="text-sm font-medium text-primary-600 hover:underline"
                        >
                          Urgence motivée ? Soumettre à l&apos;administration
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0 self-start sm:self-center">
                  <StatusBadge status={req.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
