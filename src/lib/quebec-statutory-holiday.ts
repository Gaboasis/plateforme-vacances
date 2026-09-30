/**
 * Indemnité de jour férié (Québec) — approximation pour analyse de période.
 *
 * Règle usuelle (Normes du travail) : 1/20 du salaire gagné durant les 4 semaines
 * de paie complètes précédant la semaine du jour férié, **par** jour férié chômé.
 *
 * Si la période analysée couvre les salaires de référence (ex. trimestre), on estime :
 *   indemnité employé = (salaire brut cumulé dans la période / 20) × nb jours fériés
 *
 * Si peu de jours travaillés enregistrés, repli : salaire moyen par jour travaillé × nb fériés.
 */

export type EducatorPeriodPayStats = {
  educatorId: string;
  educatorName: string;
  totalGrossCents: number;
  daysWorked: number;
};

export type StatutoryHolidayIndemnityRow = EducatorPeriodPayStats & {
  indemnityCents: number;
  method: "one_twentieth" | "average_daily";
};

export function computeStatutoryHolidayIndemnities(
  stats: EducatorPeriodPayStats[],
  statutoryHolidayCount: number
): StatutoryHolidayIndemnityRow[] {
  const n = Math.max(0, Math.floor(statutoryHolidayCount));
  if (n === 0) return [];

  return stats
    .filter((s) => s.totalGrossCents > 0)
    .map((s) => {
      let indemnityCents = 0;
      let method: StatutoryHolidayIndemnityRow["method"] = "one_twentieth";

      if (s.totalGrossCents > 0) {
        indemnityCents = Math.round((s.totalGrossCents / 20) * n);
      }

      if (s.daysWorked > 0 && s.daysWorked < 10) {
        const avgDaily = Math.round(s.totalGrossCents / s.daysWorked);
        const alt = avgDaily * n;
        if (alt > indemnityCents) {
          indemnityCents = alt;
          method = "average_daily";
        }
      }

      return {
        ...s,
        indemnityCents,
        method,
      };
    });
}

export function totalHolidayIndemnityCents(rows: StatutoryHolidayIndemnityRow[]): number {
  return rows.reduce((sum, r) => sum + r.indemnityCents, 0);
}
