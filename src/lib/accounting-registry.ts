import type { AccountingConfig, Educator } from "@/types";
import { AUDIT_ACTIONS } from "./store";
import type { AccountingAuditDetail } from "./journal-audit";
import { writeAccountingRegistryEntry } from "./journal-audit";

function formatMoneyCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} $`;
}

const CONFIG_LABELS: Record<string, string> = {
  dailyChildRateCents: "Tarif journalier (enfant)",
  dailyInfantRateCents: "Tarif journalier poupon",
  dailyOver18RateCents: "Tarif journalier 18 mois+",
  employerContributionMethod: "Méthode cotisations",
  defaultEmployerContributionPercent: "Cotisations employeur (%)",
  qcRrqEmployerPercent: "RRQ employeur (%)",
  qcAeEmployerPercent: "AE employeur (%)",
  qcRqapEmployerPercent: "RQAP employeur (%)",
  qcFssEmployerPercent: "FSS employeur (%)",
  qcCnesstEmployerPercent: "CNESST employeur (%)",
  sickLeaveIndemnityPercent: "Indemnité maladie (%)",
  pettyCashOpeningBalanceCents: "Solde initial petite caisse",
};

function displayConfigField(key: string, value: unknown): string {
  if (value == null) return "—";
  if (key.endsWith("Cents")) return formatMoneyCents(Number(value));
  if (key.includes("Percent") || key === "sickLeaveIndemnityPercent") {
    return `${Number(value)} %`;
  }
  if (key === "employerContributionMethod") {
    return value === "flat_percent" ? "Pourcentage fixe" : "Statutaire Québec";
  }
  return String(value);
}

export async function recordAccountingConfigChangeAudit(options: {
  before: AccountingConfig;
  after: AccountingConfig;
  actorId: string;
  actorName: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const keys = Object.keys(CONFIG_LABELS) as (keyof typeof CONFIG_LABELS)[];
  const changes: NonNullable<AccountingAuditDetail["changes"]> = [];
  for (const key of keys) {
    const b = (options.before as unknown as Record<string, unknown>)[key];
    const a = (options.after as unknown as Record<string, unknown>)[key];
    if (b === a) continue;
    if (
      key.endsWith("Cents") &&
      Number(b) === Number(a)
    ) {
      continue;
    }
    changes.push({
      field: key,
      fieldLabel: CONFIG_LABELS[key] ?? key,
      before: b as string | number | null,
      after: a as string | number | null,
      beforeDisplay: displayConfigField(key, b),
      afterDisplay: displayConfigField(key, a),
    });
  }
  if (changes.length === 0) return;

  await writeAccountingRegistryEntry({
    detail: {
      scope: "config",
      changeType: "modified",
      lineSummary: "Paramètres comptables",
      changes,
    },
    actorId: options.actorId,
    actorName: options.actorName,
    action: AUDIT_ACTIONS.ACCOUNTING_CONFIG_CHANGED,
    resourceType: "AccountingConfig",
    resourceId: "default",
    ip: options.ip,
    userAgent: options.userAgent,
  });
}

export async function recordAccountingPettyCashAudit(options: {
  transactionDate: string;
  direction: "in" | "out";
  amountCents: number;
  note?: string;
  changeType: "added";
  actorId: string;
  actorName: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const dir = options.direction === "in" ? "Entrée" : "Sortie";
  await writeAccountingRegistryEntry({
    detail: {
      journalDate: options.transactionDate,
      scope: "petty_cash",
      changeType: options.changeType,
      lineSummary: `Petite caisse — ${dir}`,
      snapshot: { amountCents: options.amountCents },
      changes: options.note
        ? [
            {
              field: "note",
              fieldLabel: "Note",
              before: null,
              after: options.note,
              beforeDisplay: "—",
              afterDisplay: options.note,
            },
          ]
        : undefined,
    },
    actorId: options.actorId,
    actorName: options.actorName,
    action: AUDIT_ACTIONS.ACCOUNTING_PETTY_CASH,
    resourceType: "PettyCashTransaction",
    resourceId: options.resourceId ?? null,
    ip: options.ip,
    userAgent: options.userAgent,
  });
}

export async function recordAccountingWeeklyScheduleAudit(options: {
  changeType: "added" | "removed";
  periodStart: string;
  periodEnd: string;
  sourceFileName?: string;
  actorId: string;
  actorName: string;
  resourceId?: string | null;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const label = options.sourceFileName
    ? `Horaire ${options.periodStart} → ${options.periodEnd} (${options.sourceFileName})`
    : `Horaire ${options.periodStart} → ${options.periodEnd}`;
  await writeAccountingRegistryEntry({
    detail: {
      journalDate: options.periodStart,
      scope: "weekly_schedule",
      changeType: options.changeType,
      lineSummary: label,
    },
    actorId: options.actorId,
    actorName: options.actorName,
    action: AUDIT_ACTIONS.ACCOUNTING_WEEKLY_SCHEDULE,
    resourceType: "WeeklySchedule",
    resourceId: options.resourceId ?? null,
    ip: options.ip,
    userAgent: options.userAgent,
  });
}

export async function recordAccountingEducatorPayAudit(options: {
  educatorId: string;
  educatorName: string;
  changes: NonNullable<AccountingAuditDetail["changes"]>;
  actorId: string;
  actorName: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  if (options.changes.length === 0) return;
  await writeAccountingRegistryEntry({
    detail: {
      scope: "educator_pay",
      changeType: "modified",
      lineSummary: `Fiche paie — ${options.educatorName}`,
      changes: options.changes,
    },
    actorId: options.actorId,
    actorName: options.actorName,
    action: AUDIT_ACTIONS.ACCOUNTING_EDUCATOR_PAY,
    resourceType: "Educator",
    resourceId: options.educatorId,
    ip: options.ip,
    userAgent: options.userAgent,
  });
}

export function diffEducatorPayFields(
  before: Educator,
  after: Educator
): NonNullable<AccountingAuditDetail["changes"]> {
  const fields: {
    key: keyof Educator;
    label: string;
    format: (v: unknown) => string;
  }[] = [
    {
      key: "hourlyRateCents",
      label: "Taux horaire",
      format: (v) =>
        v == null ? "—" : formatMoneyCents(Number(v)),
    },
    {
      key: "employerContributionPercent",
      label: "Cotisations employeur (%)",
      format: (v) => (v == null ? "—" : `${Number(v)} %`),
    },
    {
      key: "vacationIndemnityPercent",
      label: "Indemnité vacances (%)",
      format: (v) => (v == null ? "—" : `${Number(v)} %`),
    },
  ];
  const changes: NonNullable<AccountingAuditDetail["changes"]> = [];
  for (const { key, label, format } of fields) {
    const b = before[key];
    const a = after[key];
    if (b === a) continue;
    if (key === "hourlyRateCents" && Number(b) === Number(a)) continue;
    changes.push({
      field: String(key),
      fieldLabel: label,
      before: (b ?? null) as string | number | null,
      after: (a ?? null) as string | number | null,
      beforeDisplay: format(b),
      afterDisplay: format(a),
    });
  }
  return changes;
}
