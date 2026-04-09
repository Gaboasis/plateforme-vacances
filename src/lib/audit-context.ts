import type { NextRequest } from "next/server";

/** IP client (proxy Railway / Vercel : x-forwarded-for) */
export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

export function getUserAgent(request: NextRequest): string | null {
  return request.headers.get("user-agent");
}
