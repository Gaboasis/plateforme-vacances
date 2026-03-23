"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, LogOut, Home, Shield } from "lucide-react";
import type { Educator } from "@/types";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<Educator | null>(null);
  const [appealCount, setAppealCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("user");
    if (!stored) {
      router.push("/");
      return;
    }
    try {
      const educator = JSON.parse(stored);
      if (educator?.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      setUser(educator);
    } catch {
      sessionStorage.removeItem("user");
      router.push("/");
    }
  }, [router]);

  useEffect(() => {
    const fetchCount = () => {
      fetch("/api/admin/pending-appeals")
        .then((r) => r.json())
        .then((data) => setAppealCount(data?.count ?? 0))
        .catch(() => setAppealCount(0));
    };
    fetchCount();
    const interval = setInterval(fetchCount, 8 * 60 * 60 * 1000); // Rafraîchir toutes les 8 h
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("user");
    router.push("/");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-sage-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4">
          <Link
            href="/admin"
            className="flex min-w-0 items-center gap-2 font-display font-semibold text-slate-800"
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-coral-500 text-white">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <span className="truncate text-base sm:text-xl">Admin - Les Amis Bout De Choux</span>
          </Link>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2 text-right">
              <div className="relative inline-flex">
                <div className="rounded-full bg-coral-100 px-2 py-0.5 text-xs font-medium text-coral-700">
                  Admin
                </div>
                {appealCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white shadow-md">
                    {appealCount > 99 ? "99+" : appealCount}
                  </span>
                )}
              </div>
              <p className="hidden sm:block text-sm font-medium text-slate-800">{user.name}</p>
            </div>
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

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-4 sm:py-8">{children}</main>
    </div>
  );
}
