import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { VacationRequest } from "@/types";

function formatFrDateTime(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
  } catch {
    return null;
  }
}

/**
 * Dates liées à une demande : envoi, première décision, réponse après urgence motivée.
 */
export function RequestMetaDates({ req }: { req: VacationRequest }) {
  const submitted = formatFrDateTime(req.createdAt);
  const firstDecision = formatFrDateTime(req.reviewedAt);
  const afterAppeal = formatFrDateTime(req.appealReviewedAt);

  return (
    <ul className="mt-2 space-y-1 text-xs sm:text-sm text-slate-600">
      <li>
        <span className="font-medium text-slate-700">Date de la demande :</span>{" "}
        {submitted ?? "—"}
      </li>
      {req.status === "pending" && (
        <li className="text-amber-800">
          <span className="font-medium">Décision :</span> en attente de
          l&apos;administration
        </li>
      )}
      {req.status !== "pending" && firstDecision && (
        <li>
          <span className="font-medium text-slate-700">
            {req.urgentAppealReason
              ? "Premier refus / décision initiale le :"
              : req.status === "accepted"
                ? "Acceptée le :"
                : req.status === "cancelled" && !req.rejectionReason
                  ? "Acceptée le :"
                  : "Refusée le :"}
          </span>{" "}
          {firstDecision}
        </li>
      )}
      {req.status !== "pending" && !firstDecision && (
        <li className="text-slate-500">
          <span className="font-medium text-slate-700">Décision :</span> date
          non enregistrée (anciennes données)
        </li>
      )}
      {req.urgentAppealReason && (
        <li>
          <span className="font-medium text-slate-700">
            Réponse de l&apos;admin après urgence motivée :
          </span>{" "}
          {afterAppeal ? (
            <>
              {afterAppeal}
              {req.appealReviewedAt && req.status === "accepted" && (
                <span className="text-emerald-700"> (acceptation définitive)</span>
              )}
              {req.appealReviewedAt && req.status === "rejected" && (
                <span className="text-rose-700"> (refus confirmé)</span>
              )}
            </>
          ) : (
            <span className="text-amber-800">en attente</span>
          )}
        </li>
      )}
      {req.status === "cancelled" && req.cancelledAt && (
        <li className="text-slate-600">
          <span className="font-medium text-slate-700">Annulée le :</span>{" "}
          {formatFrDateTime(req.cancelledAt)}
        </li>
      )}
      {req.status === "accepted" && req.cancellationPendingAt && (
        <li className="text-amber-800">
          <span className="font-medium">Annulation :</span> demande envoyée à
          l&apos;administration le {formatFrDateTime(req.cancellationPendingAt)}
        </li>
      )}
    </ul>
  );
}
