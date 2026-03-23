import { NextResponse } from "next/server";
import { getPendingAppealsCount } from "@/lib/store";

export async function GET() {
  try {
    const count = await getPendingAppealsCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
