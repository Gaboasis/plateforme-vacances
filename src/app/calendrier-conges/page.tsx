"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import type { Educator } from "@/types";
import { canViewVacationStaffCalendar } from "@/lib/vacation-staff-calendar";
import { isSecretaryInboxStaff } from "@/lib/staff-actor";
import { VacationStaffCalendar } from "@/components/VacationStaffCalendar";

export default function CalendrierCongesPage() {
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
      if (!canViewVacationStaffCalendar(educator)) {
        router.push("/dashboard");
        return;
      }
      setUser(educator);
    } catch {
      sessionStorage.removeItem("user");
      router.push("/");
    }
  }, [router]);

  if (!user) return null;

  const backHref =
    user.role === "admin"
      ? "/admin"
      : isSecretaryInboxStaff(user)
        ? "/bureau-demandes"
        : "/dashboard";

  return (
    <div className="min-h-screen bg-sage-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl w-full items-center gap-3 py-3 sm:py-4 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-6 sm:pr-6">
          <Link
            href={backHref}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 touch-manipulation"
            title="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex min-w-0 items-center gap-2 font-display font-semibold text-slate-800">
            <CalendarDays className="h-6 w-6 shrink-0 text-primary-600" />
            <span className="truncate">Calendrier des congés acceptés</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl py-4 sm:py-8 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pl-6 sm:pr-6">
        <VacationStaffCalendar actorId={user.id} />
      </main>
    </div>
  );
}
