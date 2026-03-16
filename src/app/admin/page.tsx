"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import type {
  VacationRequest,
  VacationRules,
  Educator,
} from "@/types";
import { getAllBiWeekRanges } from "@/lib/biweek";

const defaultRules: Partial<VacationRules> = {
  minQualifiedPresent: 1,
  minNonQualifiedPresent: 0,
  seniorityPriorityEnabled: true,
  biWeekRules: Array(26).fill(null),
};

export default function AdminPage() {
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [rules, setRules] = useState<VacationRules | null>(null);
  const [educatorsList, setEducatorsList] = useState<Educator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const router = useRouter();
  const [saveError, setSaveError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<
    "requests" | "rules" | "educators"
  >("requests");
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [passwordEditFor, setPasswordEditFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reqsRes, rulesRes, eduRes] = await Promise.all([
          fetch("/api/requests"),
          fetch("/api/rules"),
          fetch("/api/educators"),
        ]);
        const reqs = reqsRes.ok ? await reqsRes.json() : [];
        const r = rulesRes.ok ? await rulesRes.json() : null;
        const edu = eduRes.ok ? await eduRes.json() : [];
        setRequests(Array.isArray(reqs) ? reqs : []);
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
      } catch {
        setRequests([]);
        setRules(null);
        setEducatorsList([]);
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
    await fetch(`/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectionReason }),
    });
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              rejectionReason: rejectionReason || r.rejectionReason,
              reviewedAt: new Date().toISOString(),
            }
          : r
      )
    );
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

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-800">
          Administration
        </h1>
        <p className="mt-1 text-slate-500">
          Gérez les demandes de congés et configurez les règles
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-800">
            ⚠️ {pendingCount} demande{pendingCount > 1 ? "s" : ""} en attente
            d&apos;évaluation
          </p>
          <p className="mt-1 text-sm text-amber-700">
            Ces demandes concernent la dernière place autorisée pour une période
            (3 ou 4 personnes). Acceptez ou refusez-les depuis l&apos;onglet
            Demandes.
          </p>
          <button
            onClick={() => setActiveTab("requests")}
            className="mt-3 text-sm font-medium text-amber-800 underline hover:no-underline"
          >
            Voir les demandes →
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("requests")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "requests"
              ? "border-primary-500 text-primary-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Demandes ({requests.length})
          {pendingCount > 0 && (
            <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
              {pendingCount} à traiter
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
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
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
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
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="card-hover flex flex-col gap-4 sm:flex-row sm:items-center justify-between"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">
                      {req.educatorName}
                      {(() => {
                        const edu = educatorsList.find((e) => e.id === req.educatorId);
                        return edu?.seniorityRank != null ? (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            (ancienneté : rang {edu.seniorityRank})
                          </span>
                        ) : null;
                      })()}
                    </p>
                    <p className="text-sm text-slate-500">
                      {safeFormatDate(req.startDate)} — {safeFormatDate(req.endDate)}
                    </p>
                    {req.reason && (
                      <p className="mt-1 text-sm text-slate-500">{req.reason}</p>
                    )}
                    {req.status === "rejected" && req.rejectionReason && (
                      <p className="mt-2 text-sm text-rose-600">
                        {req.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={req.status} />
                    {req.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleUpdateRequestStatus(req.id, "accepted")
                          }
                          className="rounded-lg bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-200"
                        >
                          Accepter
                        </button>
                        <button
                          onClick={() =>
                            handleUpdateRequestStatus(req.id, "rejected", "Refus manuel")
                          }
                          className="rounded-lg bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-200"
                        >
                          Refuser
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
