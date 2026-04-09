import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 300;
    const logs = await getAuditLogs(Number.isFinite(limit) ? limit : 300);
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
