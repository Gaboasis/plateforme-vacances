/**
 * Cotisations employeur au Québec — base : salaire brut (rémunération imposable du jour).
 * Taux 2026 (RRQ, AE Québec, RQAP) + FSS et CNESST configurables (varient selon la masse
 * salariale et la classification CNESST). Outil journalier : pas de plafonds annuels ni
 * exemption RRQ de 3 500 $ (négligeable sur une journée complète).
 */

import type { AccountingConfig } from "@/types";
import { computeEmployerContributionCents } from "./money";

export const QUEBEC_EMPLOYER_RATES_2026 = {
  /** RRQ — part employeur (régime de base + 1re cotisation supplémentaire) */
  rrqPercent: 6.3,
  /** Assurance-emploi — part employeur, taux Québec */
  aePercent: 1.82,
  /** Régime québécois d’assurance parentale — part employeur */
  rqapPercent: 0.602,
  /** Fonds des services de santé (FSS) — taux minimal « autres employeurs », à ajuster */
  fssPercent: 1.65,
  /** CNESST — varie selon votre secteur / cote; valeur indicative garderie */
  cnesstPercent: 1.15,
} as const;

export type QuebecEmployerRateConfig = {
  rrqPercent: number;
  aePercent: number;
  rqapPercent: number;
  fssPercent: number;
  cnesstPercent: number;
};

export type QuebecEmployerBreakdown = {
  rrqCents: number;
  aeCents: number;
  rqapCents: number;
  fssCents: number;
  cnesstCents: number;
  totalCents: number;
  /** Taux effectif total sur le brut (affichage) */
  effectivePercent: number;
};

function partCents(grossCents: number, percent: number): number {
  if (grossCents <= 0 || !Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((grossCents * percent) / 100);
}

export function computeQuebecEmployerContributions(
  grossPayCents: number,
  rates: QuebecEmployerRateConfig
): QuebecEmployerBreakdown {
  const rrqCents = partCents(grossPayCents, rates.rrqPercent);
  const aeCents = partCents(grossPayCents, rates.aePercent);
  const rqapCents = partCents(grossPayCents, rates.rqapPercent);
  const fssCents = partCents(grossPayCents, rates.fssPercent);
  const cnesstCents = partCents(grossPayCents, rates.cnesstPercent);
  const totalCents =
    rrqCents + aeCents + rqapCents + fssCents + cnesstCents;
  const effectivePercent =
    grossPayCents > 0 ? (totalCents / grossPayCents) * 100 : 0;

  return {
    rrqCents,
    aeCents,
    rqapCents,
    fssCents,
    cnesstCents,
    totalCents,
    effectivePercent,
  };
}

export function quebecRatesFromConfig(
  config: Pick<
    AccountingConfig,
    | "qcRrqEmployerPercent"
    | "qcAeEmployerPercent"
    | "qcRqapEmployerPercent"
    | "qcFssEmployerPercent"
    | "qcCnesstEmployerPercent"
  >
): QuebecEmployerRateConfig {
  return {
    rrqPercent: config.qcRrqEmployerPercent,
    aePercent: config.qcAeEmployerPercent,
    rqapPercent: config.qcRqapEmployerPercent,
    fssPercent: config.qcFssEmployerPercent,
    cnesstPercent: config.qcCnesstEmployerPercent,
  };
}

export function computeEmployerCotisationForJournal(
  grossPayCents: number,
  config: AccountingConfig,
  educatorFlatPercent?: number
): { totalCents: number; effectivePercent: number; breakdown: QuebecEmployerBreakdown | null } {
  if (grossPayCents <= 0) {
    return { totalCents: 0, effectivePercent: 0, breakdown: null };
  }
  if (config.employerContributionMethod === "flat_percent") {
    const pct =
      educatorFlatPercent ?? config.defaultEmployerContributionPercent;
    const totalCents = computeEmployerContributionCents(grossPayCents, pct);
    return { totalCents, effectivePercent: pct, breakdown: null };
  }
  const breakdown = computeQuebecEmployerContributions(
    grossPayCents,
    quebecRatesFromConfig(config)
  );
  return {
    totalCents: breakdown.totalCents,
    effectivePercent: breakdown.effectivePercent,
    breakdown,
  };
}

export function formatQuebecBreakdownShort(b: QuebecEmployerBreakdown): string {
  const parts: string[] = [];
  if (b.rrqCents) parts.push(`RRQ`);
  if (b.aeCents) parts.push(`AE`);
  if (b.rqapCents) parts.push(`RQAP`);
  if (b.fssCents) parts.push(`FSS`);
  if (b.cnesstCents) parts.push(`CNESST`);
  return parts.join(" + ");
}
