"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Palette, Shield, Lock, UtensilsCrossed, Sparkles, FileText, User } from "lucide-react";

const FALLBACK_EDUCATORS: { id: string; name: string; role: string }[] = [
  { id: "1", name: "Rana", role: "educatrice" },
  { id: "2", name: "Rafika", role: "educatrice" },
  { id: "3", name: "Saliha", role: "educatrice" },
  { id: "4", name: "Hanady", role: "educatrice" },
  { id: "5", name: "Souhir", role: "educatrice" },
  { id: "6", name: "Hajar", role: "educatrice" },
  { id: "7", name: "Khira", role: "educatrice" },
  { id: "8", name: "Azza", role: "educatrice" },
  { id: "9", name: "Loubaba", role: "educatrice" },
  { id: "10", name: "Karima", role: "educatrice" },
  { id: "11", name: "Manal", role: "educatrice" },
  { id: "aicha", name: "Aicha", role: "educatrice" },
  { id: "amineh", name: "Amineh", role: "cuisiniere" },
  { id: "zooka", name: "Zooka", role: "entretien" },
  { id: "kamar", name: "Kamar", role: "secretaire" },
  { id: "admin", name: "Admin", role: "admin" },
  { id: "demo-visite", name: "Démo visite", role: "educatrice" },
];

export default function HomePage() {
  const [educators, setEducators] = useState<{ id: string; name: string; role: string }[]>(FALLBACK_EDUCATORS);
  const [selectedId, setSelectedId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [appealCount, setAppealCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/educators")
      .then((r) => r.json())
      .then((data) => setEducators(Array.isArray(data) && data.length > 0 ? data : FALLBACK_EDUCATORS))
      .catch(() => setEducators(FALLBACK_EDUCATORS));
  }, []);

  useEffect(() => {
    fetch("/api/admin/pending-appeals")
      .then((r) => r.json())
      .then((data) => setAppealCount(data?.count ?? 0))
      .catch(() => setAppealCount(0));
  }, []);

  const handleLogin = async () => {
    if (!selectedId || !password) {
      setError("Sélectionnez votre profil et entrez votre mot de passe.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ educatorId: selectedId, password }),
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        router.push(data.user.role === "admin" ? "/admin" : "/dashboard");
      } else {
        setError(data.error || "Connexion échouée");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] min-h-screen flex flex-col">
      {/* Hero : très compact sur laptop 15" et téléphones pour tout voir sans défiler */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />
        <div className="relative mx-auto max-w-6xl w-full py-2.5 sm:py-3 md:py-4 lg:py-4 px-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:px-6">
          <div className="text-center">
            <div className="mb-1 md:mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-medium text-white backdrop-blur-sm">
              <Palette className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
              <span className="hidden min-[400px]:inline sm:inline">
                Congés, maladie et échange de journée
              </span>
              <span className="min-[400px]:hidden sm:hidden">Congés · Maladie · Échange</span>
            </div>
            <h1 className="font-display text-[0.8125rem] leading-snug min-[400px]:text-sm sm:text-base md:text-xl lg:text-2xl font-bold tracking-tight text-white px-0.5">
              Congés, maladie et échange de journée
            </h1>
            <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs md:text-sm font-medium text-primary-100/95">
              Les Amis Bout De Choux
            </p>
            <p className="mx-auto mt-1 max-w-2xl text-[10px] sm:text-xs md:text-sm text-primary-100/90 px-1 leading-snug hidden sm:block md:block">
              Congés, avis maladie et échanges de journée — une seule plateforme.
            </p>
          </div>
        </div>
      </div>

      {/* Carte connexion : remonte légèrement sur le hero réduit */}
      <div className="flex-1 flex flex-col min-h-0 -mt-2 sm:-mt-3 md:-mt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] px-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:px-6">
        <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col min-h-0">
          <div className="card-hover rounded-2xl sm:rounded-2xl p-3 sm:p-4 md:p-5 flex flex-col flex-1 min-h-0">
            <h2 className="font-display text-base sm:text-lg font-semibold text-slate-800 mb-0.5">
              Connectez-vous
            </h2>
            <p className="text-center text-xs sm:text-sm font-semibold text-red-600 mb-2 sm:mb-3 leading-tight">
              Profil puis mot de passe
            </p>

            {error && (
              <p className="mb-2 rounded-lg bg-rose-50 p-2 text-xs sm:text-sm text-rose-700">
                {error}
              </p>
            )}

            {/* Grille : plus de colonnes sur laptop (2 rangées pour ~17 profils), téléphones denses mais cibles ≥44px */}
            <div className="grid grid-cols-4 min-[380px]:grid-cols-5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-9 gap-1.5 sm:gap-2 md:gap-2 mb-2 sm:mb-3">
              {educators.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  className={`relative flex flex-col items-center justify-center gap-0.5 sm:gap-1 rounded-lg sm:rounded-xl border-2 p-1 sm:p-1.5 md:p-2 transition-all min-h-[3rem] min-[380px]:min-h-[3.25rem] sm:min-h-14 touch-manipulation active:scale-[0.98] ${
                    selectedId === e.id
                      ? "border-primary-500 bg-primary-50 ring-2 ring-primary-300/50"
                      : "border-slate-200 hover:border-primary-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div
                      className={`flex h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-full ${
                        e.role === "admin"
                          ? "bg-coral-500/20 text-coral-600"
                          : e.role === "cuisiniere"
                          ? "bg-amber-500/20 text-amber-600"
                          : e.role === "entretien"
                          ? "bg-teal-500/20 text-teal-600"
                          : e.role === "secretaire"
                          ? "bg-violet-500/20 text-violet-600"
                          : "bg-primary-500/20 text-primary-600"
                      }`}
                    >
                      {e.role === "admin" ? (
                        <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : e.role === "cuisiniere" ? (
                        <UtensilsCrossed className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : e.role === "entretien" ? (
                        <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : e.role === "secretaire" ? (
                        <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      ) : (
                        <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      )}
                    </div>
                    {e.role === "admin" && appealCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                        {appealCount > 99 ? "99+" : appealCount}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-slate-800 text-[10px] min-[380px]:text-[11px] sm:text-xs text-center leading-tight line-clamp-2 w-full px-0.5 break-words hyphens-auto">
                    {e.name}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-1 sm:pt-2 shrink-0 space-y-2">
              <div>
                <label className="mb-1 block text-xs sm:text-sm font-medium text-slate-700">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 sm:left-3 top-1/2 h-4 w-4 sm:h-5 sm:w-5 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe"
                    autoComplete="current-password"
                    enterKeyHint="go"
                    className="input-field pl-9 sm:pl-10 min-h-[44px] text-base sm:text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogin}
                disabled={!selectedId || !password || loading}
                className="btn-primary w-full min-h-[48px] text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-500 touch-manipulation"
              >
                {loading ? "Connexion…" : "Accéder à la plateforme"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
