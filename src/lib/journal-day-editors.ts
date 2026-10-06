import type { Educator } from "@/types";
import { canAccessComptabilite } from "./accounting-staff";

/** Même liste fermée que l'accès comptabilité (Admin, Kamar, Loubaba). */
export function canModifyLockedJournalDay(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  return canAccessComptabilite(e);
}
