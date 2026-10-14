import type { Educator } from "@/types";
import { isLoubabaComptabilite, isKamarComptabilite } from "./accounting-staff";
import { isFullAdmin, isSecretaryInboxStaff } from "./staff-actor";

/** Calendrier des congés acceptés : admin, Kamar (secrétariat), Loubaba. */
export function canViewVacationStaffCalendar(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  if (isFullAdmin(e)) return true;
  if (isSecretaryInboxStaff(e)) return true;
  if (isKamarComptabilite(e)) return true;
  if (isLoubabaComptabilite(e)) return true;
  return false;
}
