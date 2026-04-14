"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarPlus,
  Clock,
  CheckCircle,
  XCircle,
  Stethoscope,
  Paperclip,
  ArrowLeftRight,
  Ban,
} from "lucide-react";
import type {
  Educator,
  SickLeaveReport,
  VacationRequest,
  DayOffSwapRequest,
} from "@/types";
import { ISO_WEEKDAY_OPTIONS, isoWeekdayLabel } from "@/lib/weekday-fr";
import { RequestMetaDates } from "@/components/RequestMetaDates";
import {
  canEmployeeSelfCancelAcceptedNow,
  getEmployeeSelfCancelLastMoment,
} from "@/lib/vacation-self-cancel";
import {
  canAccessDayOffSwapDashboard,
  isKamarSecretaryForSwap,
  LOUBABA_EDUCATOR_ID,
} from "@/lib/kamar-loubaba-swap";

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

  const [sickReports, setSickReports] = useState<SickLeaveReport[]>([]);
  const [sickLoading, setSickLoading] = useState(true);
  const [showSickForm, setShowSickForm] = useState(false);
  const [sickForm, setSickForm] = useState({
    startDate: "",
    endDate: "",
    note: "",
    file: null as File | null,
    noDocument: false,
  });
  const [sickSubmitting, setSickSubmitting] = useState(false);
  const [sickError, setSickError] = useState("");
  const [sickSuccessMsg, setSickSuccessMsg] = useState("");
  const [leaveNotice, setLeaveNotice] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [vacationCancelLoading, setVacationCancelLoading] = useState<
    string | null
  >(null);

  const [swapBundle, setSwapBundle] = useState<{
    inbox: DayOffSwapRequest[];
    outgoing: DayOffSwapRequest[];
    history: DayOffSwapRequest[];
  } | null>(null);
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [swapForm, setSwapForm] = useState({
    mode: "open" as "open" | "targeted",
    requesterOffDay: 1,
    targetEducatorId: "",
    message: "",
  });
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapError, setSwapError] = useState("");
  const [swapSuccess, setSwapSuccess] = useState("");
  const [swapAcceptDays, setSwapAcceptDays] = useState<Record<string, number>>(
    {}
  );
  const [educatorsForSwap, setEducatorsForSwap] = useState<Educator[]>([]);

  const loadSwaps = (educatorId: string, role: string) => {
    if (!canAccessDayOffSwapDashboard({ id: educatorId, role })) {
      setSwapBundle(null);
      return;
    }
    fetch(`/api/day-off-swaps?educatorId=${educatorId}`)
             .then((r) => r.json())
      .then((data) => {
        if (data?.inbox && data?.outgoing && data?.history) {
          setSwapBundle(data);
        } else {
          setSwapBundle({ inbox: [], outgoing: [], history: [] });
        }
      })
      .catch(() =>
        setSwapBundle({ inbox: [], outgoing: [], history: [] })
      );
  };

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
      fetch("/api/educators")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setEducatorsForSwap(data);
        })
        .catch(() => setEducatorsForSwap([]));

      Promise.all([
        fetch(`/api/requests?educatorId=${educator.id}`).then((r) => r.json()),
        fetch(`/api/sick-leaves?educatorId=${educator.id}`).then((r) => r.json()),
      ])
        .then(([reqs, sick]) => {
          setRequests(Array.isArray(reqs) ? reqs : []);
          setSickReports(Array.isArray(sick) ? sick : []);
        })
        .finally(() => {
          setLoading(false);
          setSickLoading(false);
        });
      loadSwaps(educator.id, educator.role);
    }
  }, []);

  useEffect(() => {
    if (!user || !canAccessDayOffSwapDashboard(user)) return;
    const intervalId = window.setInterval(() => {
      loadSwaps(user.id, user.role);
    }, 40000);
    return () => window.clearInterval(intervalId);
  }, [user]);

  const handleSickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSickError("");
    setSickSuccessMsg("");
    if (!sickForm.startDate || !sickForm.endDate) {
      setSickError("Indiquez les dates d’absence.");
      return;
    }
    if (!sickForm.file && !sickForm.noDocument) {
      setSickError(
        "Joignez le billet ou le document du médecin, ou activez l’option « Je n’ai pas de document à fournir »."
      );
      return;
    }
    setSickSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("educatorId", user.id);
      fd.set("educatorName", user.name);
      fd.set("startDate", sickForm.startDate);
      fd.set("endDate", sickForm.endDate);
      fd.set("note", sickForm.note);
      fd.set("noDocument", sickForm.noDocument ? "true" : "false");
      if (sickForm.file) fd.set("attachment", sickForm.file);
      const res = await fetch("/api/sick-leaves", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSickError(data.error || "Envoi impossible");
        return;
      }
      setSickReports((prev) => [data as SickLeaveReport, ...prev]);
      setSickForm({
        startDate: "",
        endDate: "",
        note: "",
        file: null,
        noDocument: false,
      });
      setShowSickForm(false);
      setSickSuccessMsg(
        "Votre absence maladie a bien été transmise à l’administration."
      );
      setTimeout(() => setSickSuccessMsg(""), 8000);
    } catch {
      setSickError("Erreur de connexion");
    } finally {
      setSickSubmitting(false);
    }
  };

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
    if (status === "cancelled")
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-800">
          <Ban className="h-3.5 w-3.5" /> Annulée
        </span>
      );
    return (
      <span className="badge-pending flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" /> En attente
      </span>
    );
  };

  if (!user) return null;

  const kamarSwap = isKamarSecretaryForSwap(user);
  const requesterIsQualified = user.isQualified === true;
  const colleagueChoices = educatorsForSwap.filter((e) => {
    if (e.role !== "educatrice" || e.id === user.id) return false;
    if (requesterIsQualified) return e.isQualified === true;
    return true;
  });

  const handleSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!kamarSwap && user.role !== "educatrice")) return;
    setSwapError("");
    setSwapSuccess("");
    const mode = kamarSwap ? "targeted" : swapForm.mode;
    const targetEducatorId = kamarSwap
      ? LOUBABA_EDUCATOR_ID
      : swapForm.mode === "targeted"
        ? swapForm.targetEducatorId
        : undefined;
    if (mode === "targeted" && !targetEducatorId) {
      setSwapError("Choisissez la collègue concernée.");
      return;
    }
    setSwapSubmitting(true);
    try {
      const res = await fetch("/api/day-off-swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          educatorId: user.id,
          educatorName: user.name,
          requesterOffDay: swapForm.requesterOffDay,
          mode,
          targetEducatorId,
          message: swapForm.message.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwapError(data.error || "Envoi impossible");
        return;
      }
      setSwapSuccess(
        kamarSwap
          ? "Votre demande a été envoyée à Loubaba. Dès qu’elle acceptera, l’échange sera confirmé."
          : swapForm.mode === "open"
            ? requesterIsQualified
              ? "Votre demande a été envoyée aux seules éducatrices qualifiées. La première qui accepte confirmera l’échange."
              : "Votre demande a été envoyée à toutes les collègues éducatrices. La première qui accepte confirmera l’échange."
            : "Votre collègue a été notifiée. Dès qu’elle acceptera, l’échange sera confirmé."
      );
      setShowSwapForm(false);
      setSwapForm({
        mode: kamarSwap ? "targeted" : "open",
        requesterOffDay: 1,
        targetEducatorId: kamarSwap ? LOUBABA_EDUCATOR_ID : "",
        message: "",
      });
      loadSwaps(user.id, user.role);
      setTimeout(() => setSwapSuccess(""), 10000);
    } catch {
      setSwapError("Erreur de connexion");
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleAcceptSwap = async (swap: DayOffSwapRequest) => {
    if (!user || user.role !== "educatrice") return;
    setSwapError("");
    const day = swapAcceptDays[swap.id] ?? 1;
    try {
      const res = await fetch(`/api/day-off-swaps/${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          educatorId: user.id,
          educatorName: user.name,
          counterpartyOffDay: day,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwapError(data.error || "Acceptation impossible");
        loadSwaps(user.id, user.role);
        return;
      }
      setSwapSuccess(
        `Échange confirmé avec ${swap.requesterName}. L’administration et votre collègue sont informées.`
      );
      loadSwaps(user.id, user.role);
      setTimeout(() => setSwapSuccess(""), 10000);
    } catch {
      setSwapError("Erreur de connexion");
    }
  };

  const handleCancelSwap = async (swapId: string) => {
    if (!user || !canAccessDayOffSwapDashboard(user)) return;
    try {
      const res = await fetch(`/api/day-off-swaps/${swapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          educatorId: user.id,
          educatorName: user.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSwapError(data.error || "Annulation impossible");
        return;
      }
      loadSwaps(user.id, user.role);
    } catch {
      setSwapError("Erreur de connexion");
    }
  };

  const handleVacationSelfCancel = async (requestId: string) => {
    if (!user) return;
    setVacationCancelLoading(requestId);
    setLeaveNotice(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/employee-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ educatorId: user.id, action: "self_cancel" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLeaveNotice({
          kind: "err",
          text: data.error || "Annulation impossible",
        });
        return;
      }
      setRequests((prev) => prev.map((r) => (r.id === requestId ? data : r)));
      setLeaveNotice({
        kind: "ok",
        text: "Votre congé a été annulé.",
      });
    } catch {
      setLeaveNotice({
        kind: "err",
        text: "Erreur de connexion",
      });
    } finally {
      setVacationCancelLoading(null);
    }
  };

  const handleVacationRequestAdminCancel = async (requestId: string) => {
    if (!user) return;
    setVacationCancelLoading(requestId);
    setLeaveNotice(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/employee-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ educatorId: user.id, action: "request_admin" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLeaveNotice({
          kind: "err",
          text: data.error || "Envoi impossible",
        });
        return;
      }
      setRequests((prev) => prev.map((r) => (r.id === requestId ? data : r)));
      setLeaveNotice({
        kind: "ok",
        text: "Demande d’annulation envoyée à l’administration.",
      });
    } catch {
      setLeaveNotice({
        kind: "err",
        text: "Erreur de connexion",
      });
    } finally {
      setVacationCancelLoading(null);
    }
  };

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

      {user.role === "educatrice" && swapBundle && swapBundle.inbox.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">
            Demandes d’échange de journée à traiter
          </h2>
          {swapBundle.inbox.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm"
            >
              <p className="font-medium text-amber-950">
                <span className="text-amber-900">{s.requesterName}</span>{" "}
                souhaite échanger sa journée de congé (
                <strong>{isoWeekdayLabel(s.requesterOffDay)}</strong>
                {s.mode === "open"
                  ? s.requesterIsQualified
                    ? ") : la première éducatrice qualifiée qui accepte confirme l’échange."
                    : ") : la première collègue éducatrice qui accepte confirme l’échange."
                  : ") avec vous (demande directe)."}
              </p>
              {s.message ? (
                <p className="mt-2 text-sm text-amber-900/90">{s.message}</p>
              ) : null}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-900">
                    Votre journée de congé actuelle (une fois l’échange fait,
                    ce sera celle de {s.requesterName} )
                  </label>
                  <select
                    className="input-field w-full sm:w-auto min-w-[200px]"
                    value={swapAcceptDays[s.id] ?? 1}
                    onChange={(e) =>
                      setSwapAcceptDays((prev) => ({
                        ...prev,
                        [s.id]: parseInt(e.target.value, 10),
                      }))
                    }
                  >
                    {ISO_WEEKDAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleAcceptSwap(s)}
                  className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 touch-manipulation min-h-[44px]"
                >
                  Accepter l’échange
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {canAccessDayOffSwapDashboard(user) && swapError && (
        <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          {swapError}
        </p>
      )}
      {canAccessDayOffSwapDashboard(user) && swapSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          ✓ {swapSuccess}
        </div>
      )}

      {/* Boutons congés / maladie / échange journée */}
      {!showForm && !showSickForm && !showSwapForm ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            onClick={() => {
              setShowForm(true);
              setShowSickForm(false);
              setShowSwapForm(false);
              setSubmitStatus("idle");
              setErrorMessage("");
              setLastRejectedContext(null);
            }}
            className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <CalendarPlus className="h-5 w-5 shrink-0" />
            Congé
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSickForm(true);
              setShowForm(false);
              setShowSwapForm(false);
              setSickError("");
              setSickSuccessMsg("");
              setSickForm({
                startDate: "",
                endDate: "",
                note: "",
                file: null,
                noDocument: false,
              });
            }}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 min-h-[44px] touch-manipulation"
          >
            <Stethoscope className="h-5 w-5 shrink-0" />
            Maladie
          </button>
          {user.role === "educatrice" || kamarSwap ? (
            <button
              type="button"
              onClick={() => {
                setShowSwapForm(true);
                setShowForm(false);
                setShowSickForm(false);
                setSwapError("");
                setSwapSuccess("");
                setSwapForm({
                  mode: kamarSwap ? "targeted" : "open",
                  requesterOffDay: 1,
                  targetEducatorId: kamarSwap ? LOUBABA_EDUCATOR_ID : "",
                  message: "",
                });
              }}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 min-h-[44px] touch-manipulation"
            >
              <ArrowLeftRight className="h-5 w-5 shrink-0" />
              Échange journée de congé
            </button>
          ) : null}
        </div>
      ) : null}

      {showSwapForm && canAccessDayOffSwapDashboard(user) ? (
        <div className="card rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-4 sm:p-6 w-full max-w-full overflow-hidden">
          <h2 className="font-display text-base sm:text-lg font-semibold text-indigo-950 mb-1">
            Demande d’échange de journée de congé
          </h2>
          <p className="mb-4 text-sm text-indigo-900/85">
            {kamarSwap ? (
              <>
                En tant que <strong>secrétaire</strong>, vous pouvez envoyer une
                demande d’échange <strong>uniquement à Loubaba</strong>, qui vous
                remplace au besoin au bureau. Loubaba recevra la demande comme une
                demande directe. L’administration est prévenue lorsque l’échange
                est confirmé.
              </>
            ) : requesterIsQualified ? (
              <>
                En tant qu’éducatrice <strong>qualifiée</strong>, vos demandes
                (ouverte ou directe) ne concernent que les collègues{" "}
                <strong>également qualifiées</strong>. Une demande ouverte n’est
                visible que par elles.
              </>
            ) : (
              <>
                En tant qu’éducatrice <strong>non qualifiée</strong>, vous pouvez
                demander un échange à <strong>toute</strong> collègue éducatrice
                (qualifiée ou non). Une demande ouverte est visible par toutes.
              </>
            )}{" "}
            {!kamarSwap ? (
              <>L’administration est prévenue lorsque l’échange est confirmé.</>
            ) : null}
          </p>
          <form onSubmit={handleSwapSubmit} className="space-y-4">
            {!kamarSwap ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-800 mb-2">
                  Type de demande
                </legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-indigo-200 bg-white p-3">
                  <input
                    type="radio"
                    name="swapMode"
                    className="mt-1"
                    checked={swapForm.mode === "open"}
                    onChange={() =>
                      setSwapForm((f) => ({
                        ...f,
                        mode: "open",
                        targetEducatorId: "",
                      }))
                    }
                  />
                  <span className="text-sm text-slate-700">
                    <strong>Toutes les collègues</strong> —{" "}
                    {requesterIsQualified
                      ? "votre demande n’est visible que par les éducatrices qualifiées ; la première qui accepte confirme l’échange."
                      : "votre demande est visible par toutes les éducatrices ; la première qui accepte confirme l’échange."}
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-indigo-200 bg-white p-3">
                  <input
                    type="radio"
                    name="swapMode"
                    className="mt-1"
                    checked={swapForm.mode === "targeted"}
                    onChange={() =>
                      setSwapForm((f) => ({ ...f, mode: "targeted" }))
                    }
                  />
                  <span className="text-sm text-slate-700">
                    <strong>Une collègue précise</strong> — à utiliser si vous
                    avez déjà convenu verbalement de l’échange avec elle.
                  </span>
                </label>
              </fieldset>
            ) : null}

            {kamarSwap ? (
              <div className="rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                <span className="font-medium text-slate-700">Destinataire :</span>{" "}
                Loubaba (demande directe uniquement)
              </div>
            ) : swapForm.mode === "targeted" ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Collègue
                </label>
                <select
                  required
                  className="input-field w-full"
                  value={swapForm.targetEducatorId}
                  onChange={(e) =>
                    setSwapForm((f) => ({
                      ...f,
                      targetEducatorId: e.target.value,
                    }))
                  }
                >
                  <option value="">— Choisir —</option>
                  {colleagueChoices.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Votre journée de congé actuelle (semaine)
              </label>
              <select
                className="input-field w-full sm:max-w-xs"
                value={swapForm.requesterOffDay}
                onChange={(e) =>
                  setSwapForm((f) => ({
                    ...f,
                    requesterOffDay: parseInt(e.target.value, 10),
                  }))
                }
              >
                {ISO_WEEKDAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Message (optionnel)
              </label>
              <textarea
                value={swapForm.message}
                onChange={(e) =>
                  setSwapForm((f) => ({ ...f, message: e.target.value }))
                }
                placeholder="Ex. Besoin de décaler pour un rendez-vous médical…"
                className="input-field min-h-[72px] resize-none"
                rows={3}
              />
            </div>

            {swapError ? (
              <p className="text-sm text-rose-600">{swapError}</p>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={swapSubmitting}
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {swapSubmitting ? "Envoi…" : "Envoyer la demande"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSwapForm(false);
                  setSwapError("");
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showSickForm ? (
        <div className="card rounded-2xl border-2 border-rose-200 bg-rose-50/40 p-4 sm:p-6 w-full max-w-full overflow-hidden">
          <h2 className="font-display text-base sm:text-lg font-semibold text-rose-900 mb-1">
            Déclarer une absence pour maladie
          </h2>
          <p className="mb-4 text-sm text-rose-800/90">
            Ceci informe l&apos;administration de votre absence. Ce n&apos;est pas une
            demande de congés : pas de règle de refus ou d&apos;acceptation.
          </p>
          <form onSubmit={handleSickSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Début de l&apos;absence
                </label>
                <input
                  type="date"
                  required
                  value={sickForm.startDate}
                  onChange={(e) =>
                    setSickForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Fin de l&apos;absence
                </label>
                <input
                  type="date"
                  required
                  value={sickForm.endDate}
                  onChange={(e) =>
                    setSickForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                  className="input-field w-full"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Précisions sur la maladie (optionnel)
              </label>
              <textarea
                value={sickForm.note}
                onChange={(e) =>
                  setSickForm((f) => ({ ...f, note: e.target.value }))
                }
                placeholder="Ex: arrêt conseillé par le médecin, grippe..."
                className="input-field min-h-[80px] resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Billet ou document du médecin — obligatoire
              </label>
              <p className="mb-3 text-xs text-slate-500">
                Photo ou PDF (max. 4 Mo) : billet médical, certificat, arrêt de
                travail, ordonnance… Si vous n&apos;avez rien à joindre pour
                l&apos;instant, utilisez l&apos;interrupteur à droite.
              </p>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
                <label
                  className={`flex min-h-[52px] flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 hover:border-rose-300 ${
                    sickForm.noDocument
                      ? "pointer-events-none opacity-45"
                      : ""
                  }`}
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-rose-600" />
                  <span className="min-w-0 truncate">
                    {sickForm.file
                      ? sickForm.file.name
                      : "Choisir un fichier — billet ou document du médecin"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    className="hidden"
                    disabled={sickForm.noDocument}
                    onChange={(e) =>
                      setSickForm((f) => ({
                        ...f,
                        file: e.target.files?.[0] ?? null,
                        noDocument: false,
                      }))
                    }
                  />
                </label>
                <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 lg:max-w-[280px]">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sickForm.noDocument}
                    aria-label={"Je n'ai pas de document à fournir"}
                    onClick={() =>
                      setSickForm((f) => {
                        const next = !f.noDocument;
                        return {
                          ...f,
                          noDocument: next,
                          file: next ? null : f.file,
                        };
                      })
                    }
                    className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 ${
                      sickForm.noDocument ? "bg-rose-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none mt-0.5 inline-block h-7 w-7 rounded-full bg-white shadow transition duration-200 ease-out ${
                        sickForm.noDocument ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm leading-snug text-slate-700">
                    Je n&apos;ai pas de document à fournir
                  </span>
                </div>
              </div>
            </div>
            {sickError && (
              <p className="text-sm text-rose-600">{sickError}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={
                  sickSubmitting || (!sickForm.file && !sickForm.noDocument)
                }
                className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sickSubmitting ? "Envoi..." : "Transmettre à l’administration"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSickForm(false);
                  setSickError("");
                  setSickForm({
                    startDate: "",
                    endDate: "",
                    note: "",
                    file: null,
                    noDocument: false,
                  });
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showForm ? (
        <div className="card rounded-2xl p-4 sm:p-6 w-full max-w-full overflow-hidden">
          <h2 className="font-display text-base sm:text-lg font-semibold text-slate-800 mb-4">
            Nouvelle demande de congés
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-full">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 w-full">
              <div className="w-full min-w-0">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Date de début
                </label>
                <input
                  type="date"
                  required
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="input-field w-full"
                />
              </div>
              <div className="w-full min-w-0">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Date de fin
                </label>
                <input
                  type="date"
                  required
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="input-field w-full"
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
      ) : null}

      {sickSuccessMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✓ {sickSuccessMsg}
        </div>
      )}

      {canAccessDayOffSwapDashboard(user) && swapBundle && (swapBundle.outgoing.length > 0 ||
        swapBundle.history.length > 0) && (
        <div className="space-y-4">
          <h2 className="font-display text-base sm:text-lg font-semibold text-slate-800 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
            Mes échanges de journée
          </h2>
          {swapBundle.outgoing.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">
                En attente de réponse
              </p>
              {swapBundle.outgoing.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm text-slate-800">
                    Vous proposez d’échanger votre{" "}
                    <strong>{isoWeekdayLabel(s.requesterOffDay)}</strong>
                    {s.mode === "open"
                      ? " (demande ouverte à toutes les collègues)."
                      : ` avec ${s.targetEducatorName ?? "une collègue"}.`}
                  </p>
                  {s.message ? (
                    <p className="mt-2 text-sm text-slate-600">{s.message}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleCancelSwap(s.id)}
                    className="mt-3 text-sm font-medium text-rose-600 hover:underline"
                  >
                    Annuler la demande
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {swapBundle.history.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">
                Échanges confirmés (à jour avec l’administration)
              </p>
              <div className="space-y-2">
                {swapBundle.history.map((s) => {
                  const vousEtes =
                    s.requesterId === user.id ? "demandeur" : "collègue";
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-slate-800"
                    >
                      <p className="font-medium text-emerald-900">
                        ✓ {s.requesterName} ({isoWeekdayLabel(s.requesterOffDay)}
                        ) ↔ {s.acceptedByName} (
                        {s.counterpartyOffDay != null
                          ? isoWeekdayLabel(s.counterpartyOffDay)
                          : "—"}
                        )
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Vous étiez{" "}
                        {vousEtes === "demandeur"
                          ? "à l’origine de la demande."
                          : "celle qui a accepté l’échange."}{" "}
                        {s.acceptedAt
                          ? format(parseISO(s.acceptedAt), "d MMM yyyy à HH:mm", {
                              locale: fr,
                            })
                          : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
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
        {leaveNotice && (
          <div
            className={`mb-4 rounded-xl p-3 text-sm ${
              leaveNotice.kind === "ok"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {leaveNotice.kind === "ok" ? "\u2713 " : ""}
            {leaveNotice.text}
          </div>
        )}
        {loading ? (
          <div className="card flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : requests.length === 0 ? (
          <div className="card text-center py-12">
            <CalendarPlus className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 text-slate-500">Aucune demande pour le moment</p>
            <p className="text-sm text-slate-400">
              Cliquez sur &quot;Congé&quot; pour commencer
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const selfCancelInfo =
                req.status === "accepted"
                  ? getEmployeeSelfCancelLastMoment(req.createdAt, req.startDate)
                  : null;
              const canSelfCancelLeave =
                req.status === "accepted" &&
                canEmployeeSelfCancelAcceptedNow(req.createdAt, req.startDate);
              return (
                <div
                  key={req.id}
                  className="card-hover flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 text-sm sm:text-base">
                      {format(parseISO(req.startDate), "d MMM yyyy", {
                        locale: fr,
                      })}{" "}
                      —{" "}
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
                    <RequestMetaDates req={req} />
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
                  <div className="shrink-0 self-start sm:self-center flex flex-col items-stretch sm:items-end gap-2 max-w-full sm:max-w-xs">
                    <StatusBadge status={req.status} />
                    {req.status === "accepted" && selfCancelInfo && (
                      <>
                        {req.cancellationPendingAt ? (
                          <p className="text-xs text-amber-800 text-right">
                            Demande d&apos;annulation en attente auprès de
                            l&apos;administration.
                          </p>
                        ) : canSelfCancelLeave ? (
                          <button
                            type="button"
                            disabled={vacationCancelLoading === req.id}
                            onClick={() => handleVacationSelfCancel(req.id)}
                            className="text-sm font-medium text-rose-700 hover:underline disabled:opacity-50 touch-manipulation text-right"
                          >
                            {vacationCancelLoading === req.id
                              ? "Annulation…"
                              : "Annuler mon congé"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={vacationCancelLoading === req.id}
                            onClick={() => handleVacationRequestAdminCancel(req.id)}
                            className="text-sm font-medium text-amber-800 hover:underline disabled:opacity-50 touch-manipulation text-right"
                          >
                            {vacationCancelLoading === req.id
                              ? "Envoi…"
                              : "Demander l’annulation à l’administration"}
                          </button>
                        )}
                        <p className="text-xs text-slate-500 text-right leading-snug">
                          {selfCancelInfo.labelFr}{" "}
                          <span className="block sm:inline sm:before:content-['—_']">
                            Limite pour annuler seul :{" "}
                            {format(selfCancelInfo.lastMoment, "d MMM yyyy", {
                              locale: fr,
                            })}
                            .
                          </span>
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Absences maladie */}
      <div>
        <h2 className="font-display text-base sm:text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-rose-500" />
          Absences maladie déclarées
        </h2>
        {sickLoading ? (
          <div className="card flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
          </div>
        ) : sickReports.length === 0 ? (
          <div className="card py-8 text-center text-sm text-slate-500">
            Aucune déclaration enregistrée. Utilisez le bouton{" "}
            <span className="font-medium text-rose-700">Maladie</span> pour
            prévenir l&apos;administration.
          </div>
        ) : (
          <div className="space-y-3">
            {sickReports.map((s) => (
              <div
                key={s.id}
                className="card-hover border-l-4 border-l-rose-500 p-4 sm:p-5"
              >
                <p className="font-medium text-slate-800 text-sm sm:text-base">
                  {format(parseISO(s.startDate), "d MMM yyyy", { locale: fr })} —{" "}
                  {format(parseISO(s.endDate), "d MMM yyyy", { locale: fr })}
                </p>
                {s.note && (
                  <p className="mt-2 text-sm text-slate-600">{s.note}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>
                    Déclaré le{" "}
                    {format(parseISO(s.createdAt), "d MMM yyyy à HH:mm", {
                      locale: fr,
                    })}
                  </span>
                  {s.hasAttachment && (
                    <a
                      href={`/api/sick-leaves/${s.id}/attachment`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-rose-600 hover:underline"
                    >
                      Voir le billet / document du médecin
                      {s.attachmentName ? ` (${s.attachmentName})` : ""}
                    </a>
                  )}
                  {s.declaredNoAttachment && !s.hasAttachment && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                      Aucun document fourni (indiqué par vous)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
