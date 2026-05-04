"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, LogOut, Home, FileText } from "lucide-react";
import type { Educator } from "@/types";
import { isSecretaryInboxStaff } from "@/lib/staff-actor";

export default function BureauDemandesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<Educator | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    if (!stored) {
      router.push("/");
      return;
    }
    try {
      const educator = JSON.parse(stored) as Educator;
      if (!isSecretaryInboxStaff(educator)) {
        router.push("/dashboard");
        return;
      }
      setUser(educator);
    } catch {
      sessionStorage.removeItem("user");
      router.push("/");
    }
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("user");
    router.push("/");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-sage-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl w-full items-center justify-between gap-2 py-3 sm:py-4 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-6 sm:pr-6">
          <Link
            href="/bureau-demandes"
            className="flex min-w-0 items-center gap-2 font-display font-semibold text-slate-800"
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="truncate text-base sm:text-xl">
              Bureau des demandes
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
              Secrétariat
            </div>
            <p className="hidden sm:block text-sm font-medium text-slate-800">
              {user.name}
            </p>
            <Link
              href="/dashboard"
              className="rounded-lg p-2.5 sm:p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 touch-manipulation"
              title="Mon espace (tableau de bord)"
            >
              <Calendar className="h-5 w-5" />
            </Link>
            <Link
              href="/"
              className="rounded-lg p-2.5 sm:p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 touch-manipulation"
              title="Accueil"
            >
              <Home className="h-5 w-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 py-2 sm:px-3 text-sm text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 touch-manipulation"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl py-4 sm:py-8 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-6 sm:pr-6">
        {children}
      </main>
    </div>
  );
}
