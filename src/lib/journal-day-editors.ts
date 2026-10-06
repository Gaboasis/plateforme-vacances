import type { Educator } from "@/types";
import { LOUBABA_EDUCATOR_ID } from "./kamar-loubaba-swap";
import { isFullAdmin, isSecretaryInboxStaff } from "./staff-actor";

export const LOUBABA_JOURNAL_EMAIL = "loubaba@garderie.fr";

/** Peut déverrouiller une journée déjà enregistrée (mot de passe requis). */
export function isLoubabaJournalEditor(
  e: Pick<Educator, "id" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  if (e.id === LOUBABA_EDUCATOR_ID) return true;
  return e.email?.trim().toLowerCase() === LOUBABA_JOURNAL_EMAIL;
}

export function canModifyLockedJournalDay(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  return (
    isFullAdmin(e) ||
    isSecretaryInboxStaff(e) ||
    isLoubabaJournalEditor(e)
  );
}
