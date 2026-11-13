import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";
import { getEducators } from "@/lib/store";
import { isFullAdmin } from "@/lib/staff-actor";
import { matchScheduleToEducators } from "@/lib/parse-employee-schedule-pdf";
import { parseEmployeeSchedulePdfBuffer } from "@/lib/parse-employee-schedule-pdf-grid";
import {
  deleteWeeklySchedule,
  listWeeklySchedules,
  replaceWeeklySchedule,
} from "@/lib/store-weekly-schedule";
import { getClientIp, getUserAgent } from "@/lib/audit-context";
import { recordAccountingWeeklyScheduleAudit } from "@/lib/accounting-registry";

export const runtime = "nodejs";

async function requireAdmin(actorId: string | undefined) {
  if (!actorId?.trim()) return null;
  const educators = await getEducators();
  const actor = educators.find((e) => e.id === actorId.trim());
  if (!actor || !isFullAdmin(actor)) return null;
  return actor;
}

export async function GET(request: NextRequest) {
  try {
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();
    if (!(await requireAdmin(actorId))) {
      return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
    }
    const schedules = await listWeeklySchedules();
    return NextResponse.json({ schedules });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const actorId = String(form.get("_actorEducatorId") ?? "").trim();
    const actor = await requireAdmin(actorId);
    if (!actor) {
      return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier PDF requis." }, { status: 400 });
    }
    if (
      !file.name.toLowerCase().endsWith(".pdf") &&
      file.type !== "application/pdf"
    ) {
      return NextResponse.json({ error: "Seuls les PDF sont acceptés." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF trop volumineux (max. 8 Mo)." }, { status: 400 });
    }

    const parsed = await pdf(buffer);
    const text = parsed.text?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Impossible de lire le texte du PDF." },
        { status: 400 }
      );
    }

    const schedule = await parseEmployeeSchedulePdfBuffer(buffer, text);
    if (!schedule) {
      return NextResponse.json(
        {
          error:
            "Format non reconnu. Utilisez le PDF « Horaire employé » exporté (période du … au …).",
        },
        { status: 400 }
      );
    }

    const educators = await getEducators();
    const matched = matchScheduleToEducators(
      schedule,
      educators.map((e) => ({ id: e.id, name: e.name }))
    );

    const saved = await replaceWeeklySchedule({
      periodStart: schedule.periodStart,
      periodEnd: schedule.periodEnd,
      sourceFileName: file.name,
      rawPdfText: text,
      rawPdfBytes: buffer,
      uploadedById: actor.id,
      uploadedByName: actor.name,
      entries: matched.entries,
    });

    try {
      await recordAccountingWeeklyScheduleAudit({
        changeType: "added",
        periodStart: schedule.periodStart,
        periodEnd: schedule.periodEnd,
        sourceFileName: file.name,
        actorId: actor.id,
        actorName: actor.name,
        resourceId: saved.id,
        ip: getClientIp(request) ?? undefined,
        userAgent: getUserAgent(request) ?? undefined,
      });
    } catch (e) {
      console.error("Audit compta (horaire PDF):", e);
    }

    return NextResponse.json({
      schedule: saved,
      employeeCount: schedule.employees.length,
      matchedEntryCount: matched.entries.length,
      unmatchedPdfNames: matched.unmatchedPdfNames,
      workDates: schedule.workDates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actorId = request.nextUrl.searchParams.get("_actorEducatorId")?.trim();
    if (!(await requireAdmin(actorId))) {
      return NextResponse.json({ error: "Réservé à l'administrateur." }, { status: 403 });
    }

    const scheduleId = request.nextUrl.searchParams.get("id")?.trim();
    if (!scheduleId) {
      return NextResponse.json(
        { error: "Paramètre id requis (horaire à supprimer)." },
        { status: 400 }
      );
    }

    const educators = await getEducators();
    const actor = educators.find((e) => e.id === actorId);
    const schedules = await listWeeklySchedules(50);
    const existing = schedules.find((s) => s.id === scheduleId);
    const removed = await deleteWeeklySchedule(scheduleId);
    if (!removed) {
      return NextResponse.json({ error: "Horaire introuvable." }, { status: 404 });
    }

    if (actor && existing) {
      try {
        await recordAccountingWeeklyScheduleAudit({
          changeType: "removed",
          periodStart: existing.periodStart,
          periodEnd: existing.periodEnd,
          sourceFileName: existing.sourceFileName,
          actorId: actor.id,
          actorName: actor.name,
          resourceId: existing.id,
          ip: getClientIp(request) ?? undefined,
          userAgent: getUserAgent(request) ?? undefined,
        });
      } catch (e) {
        console.error("Audit compta (horaire supprimé):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
