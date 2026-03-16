import { NextRequest, NextResponse } from "next/server";
import { getVacationRequestById, updateVacationRequest } from "@/lib/store";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, rejectionReason } = body;

    const existing = await getVacationRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    const updated = await updateVacationRequest(id, {
      status: status || existing.status,
      rejectionReason: rejectionReason ?? existing.rejectionReason,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
