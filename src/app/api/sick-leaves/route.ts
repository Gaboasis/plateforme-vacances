import { NextRequest, NextResponse } from "next/server";
import {
  createSickLeaveReport,
  getEducators,
  getSickLeaveReports,
} from "@/lib/store";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export async function GET(request: NextRequest) {
  try {
    const educatorId = request.nextUrl.searchParams.get("educatorId");
    const list = await getSickLeaveReports(educatorId ?? undefined);
    return NextResponse.json(list);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const educatorId = String(form.get("educatorId") ?? "").trim();
    const educatorNameRaw = String(form.get("educatorName") ?? "").trim();
    const startDate = String(form.get("startDate") ?? "").trim();
    const endDate = String(form.get("endDate") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();

    if (!educatorId || !startDate || !endDate) {
      return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      return NextResponse.json(
        { error: "La date de fin doit être après la date de début." },
        { status: 400 }
      );
    }

    const educators = await getEducators();
    const edu = educators.find((e) => e.id === educatorId);
    if (!edu) {
      return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    }
    if (edu.role === "admin") {
      return NextResponse.json({ error: "Non applicable" }, { status: 400 });
    }

    const educatorName = educatorNameRaw || edu.name;

    const noDocument =
      String(form.get("noDocument") ?? "") === "true" ||
      String(form.get("noDocument") ?? "") === "on";

    const file = form.get("attachment");
    let attachmentBase64: string | null = null;
    let attachmentMime: string | null = null;
    let attachmentName: string | null = null;

    const hasFile = file instanceof File && file.size > 0;

    if (!hasFile && !noDocument) {
      return NextResponse.json(
        {
          error:
            "Joignez le billet ou le document du médecin, ou indiquez que vous n’avez pas de document à fournir.",
        },
        { status: 400 }
      );
    }

    let declaredNoAttachment = noDocument && !hasFile;

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "Fichier trop volumineux (max. 4 Mo)." },
          { status: 400 }
        );
      }
      const mime = file.type || "application/octet-stream";
      if (!ALLOWED_MIME.has(mime)) {
        return NextResponse.json(
          {
            error:
              "Format non pris en charge. Utilisez une image (JPEG, PNG, WebP, GIF) ou un PDF.",
          },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      attachmentBase64 = buf.toString("base64");
      attachmentMime = mime;
      attachmentName = file.name || "document";
      declaredNoAttachment = false;
    }

    const created = await createSickLeaveReport({
      educatorId,
      educatorName,
      startDate,
      endDate,
      note: note || null,
      attachmentBase64,
      attachmentMime,
      attachmentName,
      declaredNoAttachment,
    });

    return NextResponse.json(created);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
