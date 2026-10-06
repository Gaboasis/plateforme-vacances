import type { Educator } from "@/types";
import {
  KAMAR_SECRETARY_SWAP_ID,
  LOUBABA_EDUCATOR_ID,
} from "./kamar-loubaba-swap";
import { KAMAR_SECRETARY_INBOX_EMAIL } from "./staff-actor";

export const LOUBABA_COMPTABILITE_EMAIL = "loubaba@garderie.fr";

/** Accès comptabilité : uniquement Admin, Kamar et Loubaba (liste fermée). */
export function isKamarComptabilite(
  e: Pick<Educator, "id" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  if (e.id === KAMAR_SECRETARY_SWAP_ID) return true;
  return e.email?.trim().toLowerCase() === KAMAR_SECRETARY_INBOX_EMAIL;
}

export function isLoubabaComptabilite(
  e: Pick<Educator, "id" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  if (e.id === LOUBABA_EDUCATOR_ID) return true;
  return e.email?.trim().toLowerCase() === LOUBABA_COMPTABILITE_EMAIL;
}

export function canAccessComptabilite(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  if (e.role === "admin") return true;
  return isKamarComptabilite(e) || isLoubabaComptabilite(e);
}

/** Taux horaires, tarifs inscriptions, brut, cotisations et rapports paie détaillés — admin uniquement. */
export function canViewComptabiliteSalaryDetails(
  e: Pick<Educator, "role"> | undefined | null
): boolean {
  return e?.role === "admin";
}

/** @deprecated Alias — préférer `canAccessComptabilite`. */
export function isAccountingStaff(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  return canAccessComptabilite(e);
}

export function findAccountingActor(
  educators: Pick<Educator, "id" | "role" | "email" | "name">[],
  actorId: string | undefined | null
): Pick<Educator, "id" | "role" | "name"> | undefined {
  if (!actorId?.trim()) return undefined;
  const e = educators.find((x) => x.id === actorId.trim());
  if (!e || !canAccessComptabilite(e)) return undefined;
  return e;
}
