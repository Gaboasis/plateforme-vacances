import type { Educator } from "@/types";
import { KAMAR_SECRETARY_SWAP_ID } from "./kamar-loubaba-swap";

/** Courriel institutionnel (seed) : reconnaît la secrétaire même si l’`id` en base diffère. */
export const KAMAR_SECRETARY_INBOX_EMAIL = "kamar@garderie.fr";

/** Accès complet administration (paramètres, comptes, suppression définitive réservée au besoin). */
export function isFullAdmin(
  e: Pick<Educator, "id" | "role"> | undefined | null
): boolean {
  return e?.role === "admin";
}

function isKamarSecretaryInboxByIdentity(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  if (e?.role !== "secretaire") return false;
  if (e.id === KAMAR_SECRETARY_SWAP_ID) return true;
  const em = e.email?.trim().toLowerCase();
  return em === KAMAR_SECRETARY_INBOX_EMAIL;
}

/**
 * Secrétaire (Kamar) : traiter les demandes comme l’admin, sans toucher aux paramètres globaux.
 * Reconnaissance par `id` seed (`kamar`) ou par courriel `kamar@garderie.fr` si l’id diffère en prod.
 */
export function isSecretaryInboxStaff(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  return isKamarSecretaryInboxByIdentity(e);
}

/** Peut traiter congés / maladie / échanges (au même titre opérationnel que l’admin). */
export function isStaffInboxActor(
  e: Pick<Educator, "id" | "role" | "email"> | undefined | null
): boolean {
  if (!e) return false;
  return isFullAdmin(e) || isKamarSecretaryInboxByIdentity(e);
}

export function findStaffInboxActor(
  educators: Pick<Educator, "id" | "role" | "name" | "email">[],
  actorId: string | undefined | null
): Pick<Educator, "id" | "role" | "name"> | undefined {
  if (!actorId?.trim()) return undefined;
  const e = educators.find((x) => x.id === actorId.trim());
  if (!e || !isStaffInboxActor(e)) return undefined;
  return e;
}
