"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Palette,
  Shield,
  Lock,
  UtensilsCrossed,
  Sparkles,
  FileText,
  User,
} from "lucide-react";

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

function roleIcon(role: string) {
  switch (role) {
    case "admin":
      return <Shield className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />;
    case "cuisiniere":
      return <UtensilsCrossed className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />;
    case "entretien":
      return <Sparkles className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />;
    case "secretaire":
      return <FileText className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />;
    default:
      return <User className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" />;
  }
}

function roleAvatarClass(role: string) {
  switch (role) {
    case "admin":
      return "bg-gradient-to-br from-amber-100 to-orange-100 text-orange-700 ring-1 ring-orange-200/80";
    case "cuisiniere":
      return "bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700 ring-1 ring-amber-200/80";
    case "entretien":
      return "bg-gradient-to-br from-teal-50 to-emerald-100 text-teal-700 ring-1 ring-teal-200/80";
    case "secretaire":
      return "bg-gradient-to-br from-violet-50 to-purple-100 text-violet-700 ring-1 ring-violet-200/80";
    default:
      return "bg-gradient-to-br from-primary-100 to-sky-100 text-primary-700 ring-1 ring-primary-200/80";
  }
}

export default function HomePage() {
  const [educators, setEducators] = useState<
    { id: string; name: string; role: string }[]
  >(FALLBACK_EDUCATORS);
  const [selectedId, setSelectedId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [appealCount, setAppealCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/educators")
      .then((r) => r.json())
      .then((data) =>
        setEducators(Array.isArray(data) && data.length > 0 ? data : FALLBACK_EDUCATORS)
      )
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
    <div className="min-h-[100dvh] min-h-screen flex flex-col bg-slate-100/80">
      {/* En-tête : gradient, respiration visuelle, lisible sur laptop et mobile */}
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-primary-600 via-primary-600 to-primary-800 pt-[max(0.5rem,env(safe-area-inset-top))] pb-14 sm:pb-16 md:pb-20">
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='64' height='64' viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23ffffff' fill-opacity='1' d='M32 0h32v32H32V0zm0 32h32v32H32V32zM0 32h32v32H0V32zM0 0h32v32H0V0z'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-900/20 to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-md sm:text-sm">
            <Palette className="h-3.5 w-3.5 shrink-0 opacity-90" />
            <span className="hidden sm:inline">
              Congés, maladie et échange de journée
            </span>
            <span className="sm:hidden">Congés · Maladie · Échange</span>
          </div>
          <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl md:text-3xl lg:text-[2rem] drop-shadow-sm">
            Congés, maladie et échange de journée
          </h1>
          <p className="mt-2 text-sm font-medium text-primary-100 sm:text-base">
            Les Amis Bout De Choux
          </p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-primary-100/85 sm:text-sm">
            Une plateforme unique pour vos congés, vos avis maladie et vos
            échanges de journée.
          </p>
        </div>
      </header>

      {/* Carte : chevauche le hero, ombre douce, flux naturel (plus de grand vide au milieu) */}
      <main className="relative z-10 flex-1 px-3 sm:px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] -mt-10 sm:-mt-12 md:-mt-14">
        <div className="mx-auto w-full max-w-4xl">
          <div
            className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xl shadow-slate-300/25 sm:p-7 md:p-8"
            style={{ boxShadow: "0 25px 50px -12px rgb(15 23 42 / 0.12)" }}
          >
            <div className="mb-5 flex flex-col gap-1 border-b border-slate-100 pb-5 text-center sm:text-left">
              <h2 className="font-display text-lg font-semibold text-slate-900 sm:text-xl">
                Connexion
              </h2>
              <p className="text-sm text-slate-600">
                Choisissez votre profil, puis saisissez votre mot de passe.
              </p>
            </div>

            {error ? (
              <p
                className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Votre profil
            </p>
            <div className="grid grid-cols-3 min-[400px]:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2 sm:gap-3">
              {educators.map((e) => {
                const selected = selectedId === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={[
                      "group relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 sm:py-3.5 transition-all duration-200 touch-manipulation",
                      "min-h-[4.5rem] sm:min-h-[5.25rem]",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2",
                      selected
                        ? "border-primary-500 bg-gradient-to-b from-primary-50 to-white shadow-md shadow-primary-500/10 scale-[1.02]"
                        : "border-slate-200/90 bg-slate-50/50 hover:border-primary-300 hover:bg-white hover:shadow-md hover:shadow-slate-200/60 active:scale-[0.98]",
                    ].join(" ")}
                  >
                    <div className="relative">
                      <div
                        className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full shadow-inner ${roleAvatarClass(e.role)}`}
                      >
                        {roleIcon(e.role)}
                      </div>
                      {e.role === "admin" && appealCount > 0 ? (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-white">
                          {appealCount > 99 ? "99+" : appealCount}
                        </span>
                      ) : null}
                    </div>
                    <span className="w-full px-0.5 text-center text-[11px] font-semibold leading-tight text-slate-800 sm:text-xs line-clamp-2 break-words">
                      {e.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
              <div>
                <label
                  htmlFor="login-password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Votre mot de passe"
                    autoComplete="current-password"
                    enterKeyHint="go"
                    className="input-field rounded-2xl border-slate-200 pl-11 shadow-sm transition-shadow focus:shadow-md"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogin}
                disabled={!selectedId || !password || loading}
                className="btn-primary w-full rounded-2xl py-3.5 text-base font-semibold shadow-lg shadow-primary-500/25 transition hover:shadow-xl hover:shadow-primary-500/20 disabled:shadow-none sm:py-3"
              >
                {loading ? "Connexion…" : "Accéder à la plateforme"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
