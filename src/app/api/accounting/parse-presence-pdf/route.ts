import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";
import { findAccountingActor } from "@/lib/accounting-staff";
import { buildPresenceImport } from "@/lib/parse-presence-pdf";
import { getEducatorPaySummaries } from "@/lib/store-accounting";
import { getEducators } from "@/lib/store";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const actorId =
      typeof form.get("_actorEducatorId") === "string"
        ? String(form.get("_actorEducatorId")).trim()
        : "";
    const educators = await getEducators();
    if (!findAccountingActor(educators, actorId)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier PDF requis." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés." },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "PDF trop volumineux (max. 5 Mo)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdf(buffer);
    const text = parsed.text ?? "";

    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "Impossible de lire le texte du PDF (scan ou document protégé).",
        },
        { status: 400 }
      );
    }

    const payRates = await getEducatorPaySummaries();
    const result = buildPresenceImport(
      text,
      payRates.map((e) => ({ id: e.id, name: e.name }))
    );

    if (result.rawLineCount === 0) {
      return NextResponse.json(
        {
          error:
            "Aucune ligne « Historique des présences » reconnue. Vérifiez que c'est le bon export GAB.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
