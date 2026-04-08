/**
 * Compte de démonstration : mêmes règles de validation que les autres (préavis, durée max, etc.),
 * mais ses congés acceptés ne comptent pas dans les calculs d’effectif / places pour le personnel réel.
 */
export const DEMO_EDUCATOR_ID = "demo-visite";

export function isDemoEducatorId(educatorId: string): boolean {
  return educatorId === DEMO_EDUCATOR_ID;
}
