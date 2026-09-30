import type { Educator } from "@/types";
import { isFullAdmin, isSecretaryInboxStaff } from "./staff-actor";

/** Journal comptable : admin (test) puis secrétaire (Kamar) en production. */
export function isAccountingStaff(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  return isFullAdmin(e) || isSecretaryInboxStaff(e);
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
