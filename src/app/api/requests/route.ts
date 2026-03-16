import { NextRequest, NextResponse } from "next/server";
import {
  addVacationRequest,
  updateVacationRequest,
  getRequestsByEducator,
  getVacationRequests,
  getVacationRules,
  getEducators,
} from "@/lib/store";
import { validateVacationRequest } from "@/lib/rules-engine";

export async function GET(request: NextRequest) {
  try {
    const educatorId = request.nextUrl.searchParams.get("educatorId");
    if (educatorId) {
      const reqs = await getRequestsByEducator(educatorId);
      return NextResponse.json(reqs);
    }
    const reqs = await getVacationRequests();
    return NextResponse.json(reqs);
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { educatorId, educatorName, startDate, endDate, reason } = body;

    if (!educatorId || !educatorName || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Données manquantes" },
        { status: 400 }
      );
    }

    const [rules, vacationRequests, educators] = await Promise.all([
      getVacationRules(),
      getVacationRequests(),
      getEducators(),
    ]);

    const validation = validateVacationRequest(
      { educatorId, educatorName, startDate, endDate, reason },
      { rules, vacationRequests, educators }
    );

    if (!validation.valid) {
      const rejectedRequest = await addVacationRequest(
        { educatorId, educatorName, startDate, endDate, reason },
        "rejected"
      );
      await updateVacationRequest(rejectedRequest.id, {
        rejectionReason: validation.reason,
      });
      return NextResponse.json({
        request: { ...rejectedRequest, rejectionReason: validation.reason },
        accepted: false,
        error: validation.reason,
      });
    }

    const status = validation.requiresManualReview ? "pending" : "accepted";
    const newRequest = await addVacationRequest(
      { educatorId, educatorName, startDate, endDate, reason },
      status
    );

    return NextResponse.json({
      request: newRequest,
      accepted: status === "accepted",
      pending: status === "pending",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
