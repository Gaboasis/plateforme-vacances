/** Secrétaire autorisée à demander un échange de jour (uniquement vers Loubaba). */
export const KAMAR_SECRETARY_SWAP_ID = "kamar";
/** Éducatrice qui remplace Kamar au besoin — seule cible des demandes d’échange de la secrétaire. */
export const LOUBABA_EDUCATOR_ID = "9";

export function isKamarSecretaryForSwap(
  educator: { id: string; role: string } | null | undefined
): boolean {
  return (
    educator?.role === "secretaire" &&
    educator.id === KAMAR_SECRETARY_SWAP_ID
  );
}

export function canAccessDayOffSwapDashboard(
  educator: { id: string; role: string } | null | undefined
): boolean {
  if (!educator) return false;
  if (educator.role === "educatrice") return true;
  return isKamarSecretaryForSwap(educator);
}
