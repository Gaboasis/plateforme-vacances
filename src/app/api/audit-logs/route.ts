import { NextRequest, NextResponse } from "next/server";
import { AUDIT_ACTIONS, getAuditLogs } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 300;
    const loginOnly =
      request.nextUrl.searchParams.get("loginOnly") === "1" ||
      request.nextUrl.searchParams.get("loginOnly") === "true";
    const logs = await getAuditLogs(Number.isFinite(limit) ? limit : 300, {
      actions: loginOnly ? [AUDIT_ACTIONS.USER_LOGIN_SUCCESS] : undefined,
    });
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
