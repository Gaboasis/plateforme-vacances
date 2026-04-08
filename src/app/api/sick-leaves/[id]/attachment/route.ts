import { NextResponse } from "next/server";
import { getSickLeaveReportByIdRaw } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await getSickLeaveReportByIdRaw(id);
    if (!row?.attachmentBase64 || !row.attachmentMime) {
      return NextResponse.json({ error: "Pièce jointe introuvable" }, { status: 404 });
    }
    const buffer = Buffer.from(row.attachmentBase64, "base64");
    const filename = row.attachmentName || "piece-jointe";
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": row.attachmentMime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
