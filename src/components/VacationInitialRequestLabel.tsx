import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { VacationRequest } from "@/types";

function fmtRange(start: string, end: string): string {
  try {
    const s = format(parseISO(start), "d MMM yyyy", { locale: fr });
    const e = format(parseISO(end), "d MMM yyyy", { locale: fr });
    return start === end ? s : `${s} — ${e}`;
  } catch {
    return `${start} — ${end}`;
  }
}

/** Libellé lorsque l'employé a accepté une période suggérée après un refus partiel. */
export function VacationInitialRequestLabel({
  req,
  variant = "admin",
}: {
  req: Pick<
    VacationRequest,
    "initialRequestStartDate" | "initialRequestEndDate" | "startDate" | "endDate"
  >;
  variant?: "admin" | "employee";
}) {
  const i0 = req.initialRequestStartDate;
  const i1 = req.initialRequestEndDate;
  if (!i0 || !i1) return null;

  const initialLabel = fmtRange(i0, i1);
  const keptLabel = fmtRange(req.startDate, req.endDate);

  if (variant === "employee") {
    return (
      <p className="mt-2 text-sm text-primary-800">
        Vous aviez demandé{" "}
        <span className="font-medium">{initialLabel}</span>. Période retenue
        (suggestion du système) :{" "}
        <span className="font-medium">{keptLabel}</span>.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
      <p className="font-medium text-sky-900">Option suggérée acceptée</p>
      <p className="mt-0.5">
        Demande initiale :{" "}
        <span className="font-medium">{initialLabel}</span>
        {" · "}
        Période enregistrée :{" "}
        <span className="font-medium">{keptLabel}</span>
      </p>
    </div>
  );
}
