"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, LogOut, Home, ArrowLeft, Lock } from "lucide-react";
import type { Educator } from "@/types";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<(Educator & { _adminAccess?: boolean }) | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    if (!stored) {
      router.push("/");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("adminUserBackup");
    router.push("/");
  };

  const handleChangePassword = async () => {
    if (!user) return;
    setPasswordError("");
    if (!isAdminAccess && !currentPassword.trim()) {
      setPasswordError("Entrez votre mot de passe actuel");
      return;
    }
    if (!newPassword.trim() || newPassword.length < 4) {
      setPasswordError("Nouveau mot de passe requis (min. 4 caractères)");
      return;
    }
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          educatorId: user.id,
          currentPassword: isAdminAccess ? undefined : currentPassword,
          newPassword: newPassword.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setTimeout(() => {
          setShowPasswordModal(false);
          setPasswordSuccess(false);
        }, 1500);
      } else {
        setPasswordError(data.error || "Erreur");
      }
    } catch {
      setPasswordError("Erreur de connexion");
    }
  };

  const handleBackToAdmin = () => {
    const adminBackup = sessionStorage.getItem("adminUserBackup");
    sessionStorage.removeItem("adminUserBackup");
    if (adminBackup) {
      sessionStorage.setItem("user", adminBackup);
    }
    router.push("/admin");
  };

  if (!user) return null;

  const isAdminAccess = user._adminAccess === true;

  return (
    <div className="min-h-screen bg-sage-50">
      {isAdminAccess && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-amber-100 px-6 py-2 text-amber-900">
          <span className="text-sm font-medium">
            Accès admin au compte de {user.name}
          </span>
          <button
            onClick={handleBackToAdmin}
            className="flex items-center gap-1 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium hover:bg-amber-300"
          >
            <ArrowLeft className="h-4 w-4" /> Retour à l&apos;admin
          </button>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href={user.role === "admin" ? "/admin" : "/dashboard"}
            className="flex items-center gap-2 font-display text-xl font-semibold text-slate-800"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 text-white">
              <Calendar className="h-5 w-5" />
            </div>
            Gestion Vacances Les Amis Bout De Choux
          </Link>

          <div className="flex items-center gap-4">
            <p className="text-sm font-medium text-slate-800">{user.name}</p>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="Changer le mot de passe"
            >
              <Lock className="h-4 w-4" />
              Mot de passe
            </button>
            <Link
              href="/"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="Accueil"
            >
              <Home className="h-5 w-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 font-display text-lg font-semibold text-slate-800">
              Changer le mot de passe
            </h3>
            {!isAdminAccess && (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Mot de passe actuel
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Votre mot de passe actuel"
                  className="input-field"
                  autoFocus
                />
              </div>
            )}
            {isAdminAccess && (
              <p className="mb-4 text-sm text-slate-500">
                Modification du mot de passe de {user.name}
              </p>
            )}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 4 caractères"
                className="input-field"
                onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
              />
            </div>
            {passwordError && (
              <p className="mb-4 text-sm text-rose-600">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="mb-4 text-sm text-emerald-600">
                ✓ Mot de passe modifié
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleChangePassword}
                className="btn-primary flex-1"
              >
                Enregistrer
              </button>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError("");
                  setCurrentPassword("");
                  setNewPassword("");
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
