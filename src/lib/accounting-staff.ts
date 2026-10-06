import type { Educator } from "@/types";
import { isLoubabaJournalEditor } from "./journal-day-editors";
import { isFullAdmin, isSecretaryInboxStaff } from "./staff-actor";

/** Journal comptable : admin, secrétaire (Kamar), Loubaba. */
export function isAccountingStaff(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  return (
    isFullAdmin(e) ||
    isSecretaryInboxStaff(e) ||
    isLoubabaJournalEditor(e)
  );
}

export function findAccountingActor(
  educators: Pick<Educator, "id" | "role" | "email" | "name">[],
  actorId: string | undefined | null
): Pick<Educator, "id" | "role" | "name"> | undefined {
  if (!actorId?.trim()) return undefined;
  const e = educators.find((x) => x.id === actorId.trim());
  if (!e || !isAccountingStaff(e)) return undefined;
  return e;
}
