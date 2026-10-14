import { NextRequest, NextResponse } from "next/server";
import {
  addDays,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import {
  getEducators,
  getVacationRequests,
  getVacationRules,
} from "@/lib/store";
import {
  expandAcceptedVacationToDays,
  findDaysOverConcurrentLimit,
} from "@/lib/vacation-day-capacity";
import { parseVacationDate } from "@/lib/vacation-dates";
import { canViewVacationStaffCalendar } from "@/lib/vacation-staff-calendar";

export async function GET(request: NextRequest) {
  try {
    const monthParam =
      request.nextUrl.searchParams.get("month")?.trim() ?? "";
    const actorId =
      request.nextUrl.searchParams.get("_actorEducatorId")?.trim() ?? "";

    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      return NextResponse.json(
        { error: "Paramètre month requis (format YYYY-MM)." },
        { status: 400 }
      );
    }

    const educators = await getEducators();
    const actor = educators.find((e) => e.id === actorId);
    if (!actor || !canViewVacationStaffCalendar(actor)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 403 });
    }

    const monthStart = startOfMonth(parseVacationDate(`${monthParam}-01`));
    const monthEnd = endOfMonth(monthStart);
    const [vacationRequests, rules] = await Promise.all([
      getVacationRequests(),
      getVacationRules(),
    ]);
    const dayMap = expandAcceptedVacationToDays(
      vacationRequests,
      monthStart,
      monthEnd
    );
    const overCapacityDays = findDaysOverConcurrentLimit(
      rules,
      vacationRequests,
      educators,
      monthStart,
      monthEnd
    );

    const days: Record<
      string,
      { educatorId: string; educatorName: string }[]
    > = {};
    let cursor = monthStart;
    while (cursor <= monthEnd) {
      const key = format(cursor, "yyyy-MM-dd");
      days[key] = dayMap.get(key) ?? [];
      cursor = addDays(cursor, 1);
    }

    return NextResponse.json({ month: monthParam, days, overCapacityDays });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
