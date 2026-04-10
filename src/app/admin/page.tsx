"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Save,
  Plus,
  Trash2,
  Users,
  Stethoscope,
  ScrollText,
  LogIn,
} from "lucide-react";
import type {
  VacationRequest,
  VacationRules,
  Educator,
  SickLeaveReport,
  ActivityAuditLogEntry,
} from "@/types";
import { getAllBiWeekRanges } from "@/lib/biweek";
import { isDemoEducatorId } from "@/lib/demo-educator";
import { RequestMetaDates } from "@/components/RequestMetaDates";

const defaultRules: Partial<VacationRules> = {
  minQualifiedPresent: 1,
  minNonQualifiedPresent: 0,
  seniorityPriorityEnabled: true,
  biWeekRules: Array(26).fill(null),
};

export default function AdminPage() {
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [sickReports, setSickReports] = useState<SickLeaveReport[]>([]);
  const [rules, setRules] = useState<VacationRules | null>(null);
  const [educatorsList, setEducatorsList] = useState<Educator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const router = useRouter();
  const [saveError, setSaveError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<
    "requests" | "sickness" | "audit" | "logins" | "rules" | "educators"
  >("requests");
  const [auditLogs, setAuditLogs] = useState<ActivityAuditLogEntry[]>([]);
  const [loginLogs, setLoginLogs] = useState<ActivityAuditLogEntry[]>([]);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [expandedLoginId, setExpandedLoginId] = useState<string | null>(null);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [passwordEditFor, setPasswordEditFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reqsRes, sickRes, rulesRes, eduRes, auditRes, loginRes] =
          await Promise.all([
          fetch("/api/requests"),
          fetch("/api/sick-leaves"),
          fetch("/api/rules"),
          fetch("/api/educators"),
          fetch("/api/audit-logs"),
          fetch("/api/audit-logs?loginOnly=1&limit=500"),
        ]);
        const reqs = reqsRes.ok ? await reqsRes.json() : [];
        const sick = sickRes.ok ? await sickRes.json() : [];
        const r = rulesRes.ok ? await rulesRes.json() : null;
        const edu = eduRes.ok ? await eduRes.json() : [];
        const audit = auditRes.ok ? await auditRes.json() : [];
        const logins = loginRes.ok ? await loginRes.json() : [];
        setRequests(Array.isArray(reqs) ? reqs : []);
        setSickReports(Array.isArray(sick) ? sick : []);
        setRules(
          r
            ? {
                ...defaultRules,
                ...r,
        biWeekRules:
          r.biWeekRules && Array.isArray(r.biWeekRules)
            ? [...r.biWeekRules]
            : Array(52).fill(null),
              }
            : null
        );
        setEducatorsList(Array.isArray(edu) ? edu : []);
        setAuditLogs(Array.isArray(audit) ? audit : []);
        setLoginLogs(Array.isArray(logins) ? logins : []);
      } catch {
        setRequests([]);
        setSickReports([]);
        setRules(null);
        setEducatorsList([]);
        setAuditLogs([]);
        setLoginLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSaveRules = async () => {
    if (!rules) return;
    setSaving(true);
    setSaveStatus("idle");
    setSaveError("");
    try {
      const payload = {
        ...rules,
        blackoutDates: rules.blackoutDates ?? [],
        biWeekRules: (() => {
          const arr = Array.isArray(rules.biWeekRules)
            ? [...rules.biWeekRules]
            : [];
          const padded = arr.slice(0, 52);
          while (padded.length < 52) padded.push(null);
          return padded;
        })(),
      };
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRules(data);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
        setSaveError(data.error || `Erreur ${res.status}`);
      }
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRequestStatus = async (
    id: string,
    status: VacationRequest["status"],
    rejectionReason?: string
  ) => {
    const res = await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectionReason }),
    });
    const updated = res.ok ? await res.json() : null;
    if (updated) {
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? updated : r))
      );
    } else {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status,
                rejectionReason: rejectionReason || r.rejectionReason,
                reviewedAt: new Date().toISOString(),
                appealReviewedAt:
                  r.urgentAppealReason && !r.appealReviewedAt
                    ? new Date().toISOString()
                    : r.appealReviewedAt,
              }
            : r
        )
      );
    }
  };

  const addBlackoutDate = () => {
    if (!newBlackoutDate || !rules) return;
    if (rules.blackoutDates.includes(newBlackoutDate)) return;
    setRules({
      ...rules,
      blackoutDates: [...rules.blackoutDates, newBlackoutDate].sort(),
    });
    setNewBlackoutDate("");
  };

  const removeBlackoutDate = (date: string) => {
    if (!rules) return;
    setRules({
      ...rules,
      blackoutDates: rules.blackoutDates.filter((d) => d !== date),
    });
  };

  const safeFormatDate = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== "string") return "—";
    try {
      return format(parseISO(dateStr), "d MMM yyyy", { locale: fr });
    } catch {
      return dateStr;
    }
  };

  const safeFormatDateTime = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== "string") return "—";
    try {
      return format(parseISO(dateStr), "d MMM yyyy HH:mm", { locale: fr });
    } catch {
      return dateStr;
    }
  };

  const auditActionLabel = (action: string) => {
    switch (action) {
      case "vacation_request_submitted":
        return "Soumission congés";
      case "sick_leave_submitted":
        return "Déclaration maladie";
      case "vacation_urgent_appeal_submitted":
        return "Urgence motivée";
      case "user_login_success":
        return "Connexion";
      default:
        return action;
    }
  };

  const roleLabelFr = (role: string) => {
    switch (role) {
      case "educatrice":
        return "Éducatrice";
      case "admin":
        return "Administration";
      case "cuisiniere":
        return "Cuisinière";
      case "entretien":
        return "Entretien";
      case "secretaire":
        return "Secrétaire";
      default:
        return role;
    }
  };

  const parseLoginDetail = (detail?: string | null) => {
    if (!detail) return { role: "", email: "" };
    try {
      const o = JSON.parse(detail) as { role?: string; email?: string };
      return {
        role: typeof o.role === "string" ? o.role : "",
        email: typeof o.email === "string" ? o.email : "",
      };
    } catch {
      return { role: "", email: "" };
    }
  };

  const traceabilityLogs = auditLogs.filter(
    (row) => row.action !== "user_login_success"
  );

  const shortenUserAgent = (ua?: string | null, max = 72) => {
    if (!ua) return "—";
    const s = ua.trim();
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const requestsExcludingDemo = requests.filter((r) => !isDemoEducatorId(r.educatorId));

  const pendingCount = requestsExcludingDemo.filter((r) => r.status === "pending").length;
  const appealPendingCount = requestsExcludingDemo.filter(
    (r) =>
      r.status === "rejected" &&
      r.urgentAppealReason &&
      !r.appealReviewedAt
  ).length;

  /** Demandes regroupées par auteur, noms triés (fr), demandes récentes d’abord dans chaque groupe */
  const requestsByEducator = (() => {
    const map = new Map<string, VacationRequest[]>();
    for (const r of requests) {
      const arr = map.get(r.educatorId);
      if (arr) arr.push(r);
      else map.set(r.educatorId, [r]);
    }
    return Array.from(map.entries())
      .map(([educatorId, reqs]) => ({
        educatorId,
        educatorName: reqs[0]?.educatorName ?? educatorId,
        requests: [...reqs].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      }))
      .sort((a, b) =>
        a.educatorName.localeCompare(b.educatorName, "fr", {
          sensitivity: "base",
        })
      );
  })();

  const sickReportsByEducator = (() => {
    const map = new Map<string, SickLeaveReport[]>();
    for (const s of sickReports) {
      const arr = map.get(s.educatorId);
      if (arr) arr.push(s);
      else map.set(s.educatorId, [s]);
    }
    return Array.from(map.entries())
      .map(([educatorId, items]) => ({
        educatorId,
        educatorName: items[0]?.educatorName ?? educatorId,
        reports: [...items].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      }))
      .sort((a, b) =>
        a.educatorName.localeCompare(b.educatorName, "fr", {
          sensitivity: "base",
        })
      );
  })();

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-800">
          Administration
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Gérez les demandes de congés et configurez les règles
        </p>
      </div>

      {(pendingCount > 0 || appealPendingCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
          <p className="font-medium text-amber-800">
            ⚠️ {pendingCount > 0 && `${pendingCount} demande${pendingCount > 1 ? "s" : ""} en attente`}
            {pendingCount > 0 && appealPendingCount > 0 && " • "}
            {appealPendingCount > 0 && `${appealPendingCount} urgence${appealPendingCount > 1 ? "s" : ""} motivée${appealPendingCount > 1 ? "s" : ""} à traiter`}
          </p>
          <p className="mt-1 text-sm text-amber-700">
            {pendingCount > 0 && "Ces demandes concernent la dernière place autorisée. "}
            {appealPendingCount > 0 && "Des éducatrices ont soumis une raison d'urgence. "}
            Acceptez ou refusez depuis l&apos;onglet Demandes.
          </p>
          <button
            onClick={() => setActiveTab("requests")}
            className="mt-3 text-sm font-medium text-amber-800 underline hover:no-underline"
          >
            Voir les demandes →
          </button>
        </div>
      )}

      {/* Tabs — flex-wrap pour que « Connexions » etc. restent visibles sans défilement horizontal */}
      <div className="flex flex-wrap gap-x-2 gap-y-1 border-b border-slate-200 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:pb-px">
        <button
          onClick={() => setActiveTab("requests")}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === "requests"
              ? "border-primary-500 text-primary-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Demandes ({requests.length})
          {(pendingCount > 0 || appealPendingCount > 0) && (
            <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
              {pendingCount + appealPendingCount} à traiter
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("sickness")}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === "sickness"
              ? "border-rose-500 text-rose-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Stethoscope className="h-4 w-4" />
          Maladie ({sickReports.length})
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === "audit"
              ? "border-slate-600 text-slate-800"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <ScrollText className="h-4 w-4" />
          Traçabilité
        </button>
        <button
          onClick={() => setActiveTab("logins")}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === "logins"
              ? "border-indigo-500 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <LogIn className="h-4 w-4" />
          Connexions ({loginLogs.length})
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === "rules"
              ? "border-primary-500 text-primary-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Settings className="h-4 w-4" />
          Règles
        </button>
        <button
          onClick={() => setActiveTab("educators")}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === "educators"
              ? "border-primary-500 text-primary-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Users className="h-4 w-4" />
          Éducatrices
        </button>
      </div>

      {activeTab === "requests" && (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="card text-center py-16">
              <Calendar className="mx-auto h-14 w-14 text-slate-300" />
              <p className="mt-4 text-slate-600">Aucune demande pour le moment</p>
            </div>
          ) : (
            <div className="space-y-6">
              {requestsByEducator.map((group) => {
                const edu = educatorsList.find((e) => e.id === group.educatorId);
                return (
                  <div
                    key={group.educatorId}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="border-b border-slate-200 bg-gradient-to-r from-slate-100 to-primary-50/40 px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-base font-semibold text-slate-800">
                          {group.educatorName}
                          {edu?.seniorityRank != null && (
                            <span className="ml-2 text-sm font-normal text-slate-500">
                              (ancienneté : rang {edu.seniorityRank})
                            </span>
                          )}
                        </h3>
                        <span className="text-xs font-medium text-slate-500">
                          {group.requests.length} demande
                          {group.requests.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100 p-2 sm:p-3 space-y-0">
                      {group.requests.map((req) => (
                        <div
                          key={req.id}
                          className="card-hover flex flex-col gap-4 p-3 sm:p-5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">
                              {safeFormatDate(req.startDate)} —{" "}
                              {safeFormatDate(req.endDate)}
                            </p>
                            {req.reason && (
                              <p className="mt-1 text-sm text-slate-500">{req.reason}</p>
                            )}
                            {req.status === "rejected" && req.rejectionReason && (
                              <p className="mt-2 text-sm text-rose-600">
                                {req.rejectionReason}
                              </p>
                            )}
                            {req.status === "rejected" &&
                              req.urgentAppealReason &&
                              !req.appealReviewedAt && (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                  <p className="text-xs font-medium text-amber-800 mb-1">
                                    Urgence motivée :
                                  </p>
                                  <p className="text-sm text-amber-900">
                                    {req.urgentAppealReason}
                                  </p>
                                </div>
                              )}
                            <RequestMetaDates req={req} />
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2 shrink-0">
                            <StatusBadge status={req.status} />
                            {(req.status === "pending" ||
                              (req.status === "rejected" &&
                                req.urgentAppealReason &&
                                !req.appealReviewedAt)) && (
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() =>
                                    handleUpdateRequestStatus(req.id, "accepted")
                                  }
                                  className="rounded-lg bg-emerald-100 px-4 py-2.5 sm:py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-200 touch-manipulation min-h-[44px] sm:min-h-0"
                                >
                                  Accepter
                                </button>
                                <button
                                  onClick={() =>
                                    handleUpdateRequestStatus(
                                      req.id,
                                      "rejected",
                                      "Appel refusé"
                                    )
                                  }
                                  className="rounded-lg bg-rose-100 px-4 py-2.5 sm:py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-200 touch-manipulation min-h-[44px] sm:min-h-0"
                                >
                                  Refuser
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "sickness" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Chaque déclaration est un avis à l&apos;administration (dates,
            détail optionnel, pièce jointe). Aucune règle de congés ne
            s&apos;applique ici.
          </p>
          {sickReports.length === 0 ? (
            <div className="card text-center py-16">
              <Stethoscope className="mx-auto h-14 w-14 text-rose-200" />
              <p className="mt-4 text-slate-600">Aucune déclaration maladie</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sickReportsByEducator.map((group) => {
                const edu = educatorsList.find((e) => e.id === group.educatorId);
                return (
                  <div
                    key={group.educatorId}
                    className="overflow-hidden rounded-2xl border border-rose-200/80 bg-white shadow-sm"
                  >
                    <div className="border-b border-rose-100 bg-gradient-to-r from-rose-50 to-white px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-base font-semibold text-slate-800 flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-rose-600" />
                          {group.educatorName}
                          {edu?.seniorityRank != null && (
                            <span className="text-sm font-normal text-slate-500">
                              (ancienneté : rang {edu.seniorityRank})
                            </span>
                          )}
                        </h3>
                        <span className="text-xs font-medium text-rose-700/80">
                          {group.reports.length} déclaration
                          {group.reports.length > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-rose-50 p-2 sm:p-3">
                      {group.reports.map((s) => (
                        <div
                          key={s.id}
                          className="p-3 sm:p-4 text-sm text-slate-700"
                        >
                          <p className="font-medium text-slate-800">
                            {safeFormatDate(s.startDate)} —{" "}
                            {safeFormatDate(s.endDate)}
                          </p>
                          {s.note && (
                            <p className="mt-2 text-slate-600">{s.note}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>
                              Reçu le{" "}
                              {format(
                                parseISO(s.createdAt),
                                "d MMM yyyy à HH:mm",
                                { locale: fr }
                              )}
                            </span>
                            {s.hasAttachment && (
                              <a
                                href={`/api/sick-leaves/${s.id}/attachment`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-rose-600 hover:underline"
                              >
                                Billet / document du médecin
                                {s.attachmentName
                                  ? ` : ${s.attachmentName}`
                                  : ""}
                              </a>
                            )}
                            {s.declaredNoAttachment && !s.hasAttachment && (
                              <span className="rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                                Aucun document fourni (indiqué par l&apos;employé)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Journal technique des soumissions (congés, maladie, urgences motivées)
            avec date, personne, action, adresse IP et navigateur. Renseignement
            additionnel en attendant une confirmation d&apos;identité plus forte.
          </p>
          {traceabilityLogs.length === 0 ? (
            <div className="card text-center py-16">
              <ScrollText className="mx-auto h-14 w-14 text-slate-300" />
              <p className="mt-4 text-slate-600">Aucune entrée pour le moment</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 sm:px-4">Date / heure</th>
                    <th className="px-3 py-3 sm:px-4">Personne</th>
                    <th className="px-3 py-3 sm:px-4">Action</th>
                    <th className="hidden md:table-cell px-3 py-3 sm:px-4">
                      IP
                    </th>
                    <th className="hidden lg:table-cell px-3 py-3 sm:px-4 max-w-[200px]">
                      Navigateur
                    </th>
                    <th className="px-3 py-3 sm:px-4 w-24">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {traceabilityLogs.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="align-top hover:bg-slate-50/80">
                        <td className="px-3 py-3 sm:px-4 text-slate-600 whitespace-nowrap">
                          {safeFormatDateTime(row.createdAt)}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <span className="font-medium text-slate-800">
                            {row.educatorName}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500 md:hidden">
                            {row.ip || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <span className="text-slate-800">
                            {auditActionLabel(row.action)}
                          </span>
                          {row.resourceId && (
                            <span className="mt-0.5 block font-mono text-xs text-slate-500 truncate max-w-[140px] sm:max-w-none">
                              {row.resourceType} · {row.resourceId.slice(0, 12)}…
                            </span>
                          )}
                        </td>
                        <td className="hidden md:table-cell px-3 py-3 sm:px-4 font-mono text-xs text-slate-600">
                          {row.ip || "—"}
                        </td>
                        <td className="hidden lg:table-cell px-3 py-3 sm:px-4 text-xs text-slate-600 max-w-[220px] break-all">
                          {shortenUserAgent(row.userAgent, 80)}
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          {row.detail ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedAuditId((id) =>
                                  id === row.id ? null : row.id
                                )
                              }
                              className="text-primary-600 hover:underline text-xs font-medium touch-manipulation"
                            >
                              {expandedAuditId === row.id
                                ? "Masquer"
                                : "Voir"}
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedAuditId === row.id && row.detail && (
                        <tr className="bg-slate-50">
                          <td
                            colSpan={6}
                            className="px-3 py-3 sm:px-4 border-t border-slate-100"
                          >
                            <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words font-sans max-h-48 overflow-y-auto">
                              {(() => {
                                try {
                                  return JSON.stringify(
                                    JSON.parse(row.detail!),
                                    null,
                                    2
                                  );
                                } catch {
                                  return row.detail;
                                }
                              })()}
                            </pre>
                            {row.userAgent && (
                              <p className="mt-2 text-xs text-slate-500 lg:hidden break-all">
                                UA : {row.userAgent}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "logins" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Historique des connexions réussies (page d&apos;accueil), pour tout
            le personnel — y compris sans demande de congés ni déclaration de
            maladie. Adresse IP et navigateur par usage interne.
          </p>
          {loginLogs.length === 0 ? (
            <div className="card text-center py-16">
              <LogIn className="mx-auto h-14 w-14 text-slate-300" />
              <p className="mt-4 text-slate-600">Aucune connexion enregistrée</p>
              <p className="mt-2 text-xs text-slate-500">
                Les prochaines connexions apparaîtront ici après déploiement.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 sm:px-4">Date / heure</th>
                    <th className="px-3 py-3 sm:px-4">Personne</th>
                    <th className="px-3 py-3 sm:px-4">Fonction</th>
                    <th className="hidden sm:table-cell px-3 py-3 sm:px-4 max-w-[180px]">
                      Courriel
                    </th>
                    <th className="hidden md:table-cell px-3 py-3 sm:px-4">
                      IP
                    </th>
                    <th className="hidden lg:table-cell px-3 py-3 sm:px-4 max-w-[200px]">
                      Navigateur
                    </th>
                    <th className="px-3 py-3 sm:px-4 w-24">Plus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loginLogs.map((row) => {
                    const { role, email } = parseLoginDetail(row.detail);
                    return (
                      <Fragment key={row.id}>
                        <tr className="align-top hover:bg-slate-50/80">
                          <td className="px-3 py-3 sm:px-4 text-slate-600 whitespace-nowrap">
                            {safeFormatDateTime(row.createdAt)}
                          </td>
                          <td className="px-3 py-3 sm:px-4">
                            <span className="font-medium text-slate-800">
                              {row.educatorName}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500 md:hidden">
                              {row.ip || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 sm:px-4 text-slate-700">
                            {role ? roleLabelFr(role) : "—"}
                          </td>
                          <td className="hidden sm:table-cell px-3 py-3 sm:px-4 text-xs text-slate-600 break-all max-w-[200px]">
                            {email || "—"}
                          </td>
                          <td className="hidden md:table-cell px-3 py-3 sm:px-4 font-mono text-xs text-slate-600">
                            {row.ip || "—"}
                          </td>
                          <td className="hidden lg:table-cell px-3 py-3 sm:px-4 text-xs text-slate-600 max-w-[220px] break-all">
                            {shortenUserAgent(row.userAgent, 80)}
                          </td>
                          <td className="px-3 py-3 sm:px-4">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLoginId((id) =>
                                  id === row.id ? null : row.id
                                )
                              }
                              className="text-primary-600 hover:underline text-xs font-medium touch-manipulation"
                            >
                              {expandedLoginId === row.id ? "Masquer" : "Détail"}
                            </button>
                          </td>
                        </tr>
                        {expandedLoginId === row.id && (
                          <tr className="bg-slate-50">
                            <td
                              colSpan={7}
                              className="px-3 py-3 sm:px-4 border-t border-slate-100 text-xs text-slate-700 space-y-2"
                            >
                              {email && (
                                <p>
                                  <span className="font-medium text-slate-500">
                                    Courriel :{" "}
                                  </span>
                                  {email}
                                </p>
                              )}
                              {row.userAgent && (
                                <p className="break-all">
                                  <span className="font-medium text-slate-500">
                                    Navigateur complet :{" "}
                                  </span>
                                  {row.userAgent}
                                </p>
                              )}
                              <p className="font-mono text-slate-600">
                                ID profil : {row.educatorId}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "educators" && (
        <div className="card max-w-2xl space-y-6">
          <h2 className="font-display text-lg font-semibold text-slate-800">
            Personnel — Éducatrices, cuisinière, entretien, secrétaire
          </h2>
          <p className="text-sm text-slate-500">
            Rang d&apos;ancienneté (1 = plus ancienne, 15 = plus récente). Le
            statut qualifié sert au ratio et à la priorité.
          </p>
          <div className="space-y-4">
            {educatorsList
              .filter((e) => e.role !== "admin")
              .sort((a, b) => (a.seniorityRank ?? 99) - (b.seniorityRank ?? 99))
              .map((edu) => (
                <div
                  key={edu.id}
                  className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{edu.name}</p>
                    {(edu.role === "educatrice" || edu.role === "cuisiniere" || edu.role === "entretien" || edu.role === "secretaire") && (
                      <button
                        onClick={() => {
                          const adminBackup = sessionStorage.getItem("user");
                          if (adminBackup) {
                            sessionStorage.setItem("adminUserBackup", adminBackup);
                          }
                          sessionStorage.setItem(
                            "user",
                            JSON.stringify({ ...edu, _adminAccess: true })
                          );
                          router.push("/dashboard");
                        }}
                        className="mt-2 text-sm text-primary-600 hover:underline"
                      >
                        Accéder au compte (ex. départ)
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 sm:flex-1">
                    {edu.role === "educatrice" && (
                      <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Rang ancienneté (1–15)
                      </label>
                      <select
                        value={edu.seniorityRank ?? ""}
                        onChange={async (e) => {
                          const val = e.target.value;
                          const rank = val ? parseInt(val, 10) : undefined;
                          const res = await fetch("/api/educators", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: edu.id,
                              seniorityRank: rank,
                            }),
                          });
                          if (res.ok) {
                            const updated = await res.json();
                            setEducatorsList((prev) =>
                              prev.map((x) => (x.id === edu.id ? updated : x))
                            );
                          }
                        }}
                        className="input-field text-sm"
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
                          (n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`qual-${edu.id}`}
                        checked={edu.isQualified ?? false}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          const res = await fetch("/api/educators", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: edu.id,
                              isQualified: val,
                            }),
                          });
                          if (res.ok) {
                            const updated = await res.json();
                            setEducatorsList((prev) =>
                              prev.map((x) => (x.id === edu.id ? updated : x))
                            );
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <label
                        htmlFor={`qual-${edu.id}`}
                        className="text-sm font-medium text-slate-700"
                      >
                        Qualifiée
                      </label>
                    </div>
                      </>
                    )}
                    <div className="w-full sm:w-auto">
                      {passwordEditFor === edu.id ? (
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Nouveau mot de passe"
                            className="input-field text-sm w-36"
                            autoFocus
                          />
                          <button
                            onClick={async () => {
                              if (!newPassword.trim()) return;
                              const res = await fetch("/api/educators", {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  id: edu.id,
                                  newPassword: newPassword.trim(),
                                }),
                              });
                              if (res.ok) {
                                setPasswordEditFor(null);
                                setNewPassword("");
                              }
                            }}
                            className="btn-primary text-sm py-2"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => {
                              setPasswordEditFor(null);
                              setNewPassword("");
                            }}
                            className="btn-secondary text-sm py-2"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setPasswordEditFor(edu.id);
                            setNewPassword("");
                          }}
                          className="text-sm text-primary-600 hover:underline"
                        >
                          Changer mot de passe
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {activeTab === "rules" && rules && (
        <div className="card max-w-2xl space-y-6">
          <h2 className="font-display text-lg font-semibold text-slate-800">
            Conditions d&apos;acceptation des congés
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Max. personnes en congés simultanément
              </label>
              <input
                type="number"
                min={1}
                value={rules.maxConcurrentVacations}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    maxConcurrentVacations: Math.max(
                      1,
                      parseInt(e.target.value) || 1
                    ),
                  })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Préavis minimum (jours)
              </label>
              <input
                type="number"
                min={0}
                value={rules.minAdvanceNoticeDays}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    minAdvanceNoticeDays: Math.max(
                      0,
                      parseInt(e.target.value) || 0
                    ),
                  })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Jours consécutifs maximum
              </label>
              <input
                type="number"
                min={1}
                value={rules.maxConsecutiveDays}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    maxConsecutiveDays: Math.max(
                      1,
                      parseInt(e.target.value) || 1
                    ),
                  })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Demandes max. par mois (par personne)
              </label>
              <input
                type="number"
                min={1}
                value={rules.maxRequestsPerMonth}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    maxRequestsPerMonth: Math.max(
                      1,
                      parseInt(e.target.value) || 1
                    ),
                  })
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Demandes max. par année (par personne)
              </label>
              <input
                type="number"
                min={1}
                value={rules.maxRequestsPerYear ?? 2}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    maxRequestsPerYear: Math.max(
                      1,
                      parseInt(e.target.value) || 1
                    ),
                  })
                }
                className="input-field"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <h3 className="mb-2 font-medium text-slate-800">
              Plafond des congés déjà acceptés (année civile)
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              Au-delà de ces seuils, la demande est{' '}
              <strong className="text-slate-700">refusée automatiquement</strong> comme les
              autres refus : la personne peut soumettre une{' '}
              <strong className="text-slate-700">urgence motivée</strong> pour examen par
              l&apos;administration.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Jours de congés acceptés max. par an (cumul)
                </label>
                <input
                  type="number"
                  min={1}
                  value={rules.maxAcceptedVacationDaysPerYear ?? 21}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      maxAcceptedVacationDaysPerYear: Math.max(
                        1,
                        parseInt(e.target.value) || 1
                      ),
                    })
                  }
                  className="input-field"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Périodes qui se chevauchent ou se suivent sont comptées sans doublon
                  de jour.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Demandes acceptées max. par an (sur l&apos;année de début)
                </label>
                <input
                  type="number"
                  min={1}
                  value={rules.maxAcceptedRequestsPerYear ?? 3}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      maxAcceptedRequestsPerYear: Math.max(
                        1,
                        parseInt(e.target.value) || 1
                      ),
                    })
                  }
                  className="input-field"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Chaque demande acceptée compte pour l&apos;année civile de sa date de
                  début. Si « demandes max. par année » (ci-dessus) est plus bas, cette
                  limite-là s&apos;applique d&apos;abord.
                </p>
              </div>
            </div>
          </div>

          {/* Ratio qualifiées / non qualifiées */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <h3 className="mb-4 font-medium text-slate-800">
              Ratio éducatrices présentes
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              Minimum à maintenir pour accepter une demande de congés.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Qualifiées min. présentes
                </label>
                <input
                  type="number"
                  min={0}
                  value={rules.minQualifiedPresent ?? 1}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      minQualifiedPresent: Math.max(
                        0,
                        parseInt(e.target.value) || 0
                      ),
                    })
                  }
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Non qualifiées min. présentes
                </label>
                <input
                  type="number"
                  min={0}
                  value={rules.minNonQualifiedPresent ?? 0}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      minNonQualifiedPresent: Math.max(
                        0,
                        parseInt(e.target.value) || 0
                      ),
                    })
                  }
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            <strong>Première arrivée, première servie</strong> : lorsqu&apos;il n&apos;y a plus de place,
            la nouvelle demande est refusée. Un congé déjà accepté n&apos;est jamais annulé.
          </p>

          {/* 52 semaines de l'année — règles appliquées à chaque jour */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <h3 className="mb-2 font-medium text-slate-800">
              52 semaines — Règles par semaine (prises en compte par jour)
            </h3>
            <p className="mb-4 text-sm text-slate-500">
              Chaque règle s&apos;applique à tous les jours de la semaine. Laisser vide pour
              utiliser les règles globales.
            </p>
            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-2">
              {getAllBiWeekRanges(new Date().getFullYear()).map(({ index, label }) => {
                const override = (rules.biWeekRules || [])[index - 1];
                const updateOverride = (
                  field: "maxConcurrentVacations" | "minQualifiedPresent" | "minNonQualifiedPresent",
                  value: number | undefined
                ) => {
                  const arr = [...(rules.biWeekRules || Array(52).fill(null))];
                  const current = arr[index - 1] || {};
                  const next = { ...current, [field]: value };
                  const hasAny =
                    next.maxConcurrentVacations != null ||
                    next.minQualifiedPresent != null ||
                    next.minNonQualifiedPresent != null;
                  arr[index - 1] = hasAny ? next : null;
                  setRules({ ...rules, biWeekRules: arr });
                };
                return (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:flex-row sm:items-center"
                  >
                    <span className="min-w-[220px] text-sm font-medium text-slate-700">
                      {label}
                    </span>
                    <div className="flex flex-1 flex-wrap gap-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="Max congés"
                        value={override?.maxConcurrentVacations ?? ""}
                        onChange={(e) =>
                          updateOverride(
                            "maxConcurrentVacations",
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        className="input-field w-24 text-sm"
                        title="Max personnes en congés"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Qual. min"
                        value={override?.minQualifiedPresent ?? ""}
                        onChange={(e) =>
                          updateOverride(
                            "minQualifiedPresent",
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        className="input-field w-24 text-sm"
                        title="Qualifiées min. présentes"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Non qual. min"
                        value={override?.minNonQualifiedPresent ?? ""}
                        onChange={(e) =>
                          updateOverride(
                            "minNonQualifiedPresent",
                            e.target.value ? parseInt(e.target.value) : undefined
                          )
                        }
                        className="input-field w-24 text-sm"
                        title="Non qualifiées min. présentes"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Dates interdites
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="date"
                value={newBlackoutDate}
                onChange={(e) => setNewBlackoutDate(e.target.value)}
                className="input-field flex-1"
              />
              <button
                onClick={addBlackoutDate}
                className="btn-secondary flex items-center gap-1"
              >
                <Plus className="h-4 w-4" /> Ajouter
              </button>
            </div>
            {rules.blackoutDates.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {rules.blackoutDates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    {safeFormatDate(d)}
                    <button
                      onClick={() => removeBlackoutDate(d)}
                      className="ml-1 rounded p-0.5 hover:bg-slate-200 text-slate-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 mt-2">Aucune date interdite</p>
            )}
          </div>

          {saveStatus === "success" && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
              ✓ Règles enregistrées avec succès
            </p>
          )}
          {saveStatus === "error" && (
            <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              ✗ Erreur : {saveError}
            </p>
          )}
          <button
            onClick={handleSaveRules}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement..." : "Enregistrer les règles"}
          </button>
        </div>
      )}
    </div>
  );
}
