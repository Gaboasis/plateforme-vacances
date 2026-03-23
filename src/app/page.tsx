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
  { id: "amineh", name: "Amineh", role: "cuisiniere" },
  { id: "zooka", name: "Zooka", role: "entretien" },
  { id: "kamar", name: "Kamar", role: "secretaire" },
  { id: "admin", name: "Admin", role: "admin" },
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
    <div className="min-h-screen min-h-[100dvh] flex flex-col">
      {/* Hero Section - compact sur mobile pour iPhone */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 pt-[env(safe-area-inset-top)]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />
        <div className="relative mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-20 md:py-28">
          <div className="text-center">
            <div className="mb-2 sm:mb-6 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white backdrop-blur-sm">
              <Palette className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Gestion simplifiée des congés</span>
              <span className="sm:hidden">Congés</span>
            </div>
            <h1 className="font-display text-lg sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              <span className="sm:hidden">Les Amis Bout De Choux</span>
              <span className="hidden sm:inline">Gestion Vacances Les Amis Bout De Choux</span>
            </h1>
            <p className="mx-auto mt-1 sm:mt-6 max-w-2xl text-xs sm:text-lg text-primary-100 px-2 sm:block hidden">
              Demandez vos congés en quelques clics.
            </p>
          </div>
        </div>
      </div>

      {/* Login Card - visible dès le chargement sur mobile */}
      <div className="flex-1 -mt-4 sm:-mt-16 px-4 sm:px-6 pb-8 sm:pb-20">
        <div className="mx-auto max-w-4xl">
          <div className="card-hover rounded-2xl sm:rounded-3xl p-4 sm:p-8">
            <h2 className="font-display text-lg sm:text-xl font-semibold text-slate-800 mb-1 sm:mb-2">
              Connectez-vous
            </h2>
            <p className="text-center text-sm sm:text-base font-bold text-red-600 mb-4 sm:mb-6 no-underline">
              Sélectionnez votre profil et entrez votre mot de passe
            </p>

            {error && (
              <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </p>
            )}

            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3 mb-4 sm:mb-6">
              {educators.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`relative flex flex-col items-center gap-1.5 sm:gap-2 rounded-xl border-2 p-2 sm:p-3 transition-all min-h-[72px] sm:min-h-0 touch-manipulation ${
                    selectedId === e.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-slate-200 hover:border-primary-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full ${
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
                        <Shield className="h-5 w-5" />
                      ) : e.role === "cuisiniere" ? (
                        <UtensilsCrossed className="h-5 w-5" />
                      ) : e.role === "entretien" ? (
                        <Sparkles className="h-5 w-5" />
                      ) : e.role === "secretaire" ? (
                        <FileText className="h-5 w-5" />
                      ) : (
                        <User className="h-5 w-5" />
                      )}
                    </div>
                    {e.role === "admin" && appealCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white shadow-md">
                        {appealCount > 99 ? "99+" : appealCount}
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-slate-800 text-xs sm:text-sm text-center leading-tight truncate w-full">
                    {e.name}
                  </p>
                </button>
              ))}
            </div>

            <div className="mb-4 sm:mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Entrez votre mot de passe"
                  className="input-field pl-10"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
            </div>

            <button
              onClick={handleLogin}
              disabled={!selectedId || !password || loading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-500"
            >
              {loading ? "Connexion..." : "Accéder à la plateforme"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
