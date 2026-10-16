import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { DailyJournal, JournalLine, JournalLineCategory } from "@/types";
import type { JournalLineInput } from "./store-accounting";
import { AUDIT_ACTIONS, createAuditLog } from "./store";

const CATEGORY_LABELS: Record<JournalLineCategory, string> = {
  revenue_enrollment: "Inscriptions (legacy)",
  revenue_enrollment_infant: "Inscriptions poupon",
  revenue_enrollment_over18: "Inscriptions 18 mois+",
  revenue_sortie: "Sortie",
  revenue_photo: "Photos",
  revenue_other: "Autre revenu",
  expense_educator_gross: "Salaire brut éducatrice",
  expense_employer_cotisation: "Cotisations employeur",
  expense_vacation_indemnity: "Indemnité vacances",
  expense_sick_leave_indemnity: "Indemnité maladie",
  expense_other: "Autre dépense",
};

type ComparableLine = {
  fingerprint: string;
  kind: "expense" | "revenue";
  category: JournalLineCategory;
  label: string;
  educatorId: string;
  educatorName: string;
  amountCents: number;
  hoursWorked: number | null;
  hourlyRateCents: number | null;
  childCount: number | null;
  dailyRateCents: number | null;
  employerContributionPercent: number | null;
};

export type AccountingAuditDetail = {
  journalDate: string;
  changeType: "modified" | "removed" | "added";
  lineSummary: string;
  changes?: {
    field: string;
    fieldLabel: string;
    before: string | number | null;
    after: string | number | null;
    beforeDisplay: string;
    afterDisplay: string;
  }[];
  snapshot?: {
    amountCents?: number;
    hoursWorked?: number | null;
    hourlyRateCents?: number | null;
    childCount?: number | null;
  };
};

function formatMoney(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} $`;
}

function formatHours(h: number): string {
  return `${h.toFixed(2).replace(".", ",")} h`;
}

const FIELD_LABELS: Record<string, string> = {
  amountCents: "Montant",
  hoursWorked: "Heures",
  hourlyRateCents: "Taux horaire",
  childCount: "Nombre d'enfants",
  dailyRateCents: "Tarif journalier",
  employerContributionPercent: "Cotisations employeur (%)",
  label: "Libellé",
};

function displayField(field: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "amountCents" || field === "hourlyRateCents" || field === "dailyRateCents") {
    return formatMoney(Number(value));
  }
  if (field === "hoursWorked") return formatHours(Number(value));
  if (field === "employerContributionPercent") return `${Number(value)} %`;
  return String(value);
}

function lineFingerprint(line: {
  kind: string;
  category: string;
  educatorId?: string | null;
  label?: string | null;
}): string {
  return [
    line.kind,
    line.category,
    (line.educatorId ?? "").trim(),
    (line.label ?? "").trim().toLowerCase(),
  ].join("|");
}

function toComparable(
  line: JournalLine | JournalLineInput
): ComparableLine {
  return {
    fingerprint: lineFingerprint(line),
    kind: line.kind,
    category: line.category as JournalLineCategory,
    label: (line.label ?? "").trim(),
    educatorId: (line.educatorId ?? "").trim(),
    educatorName: (line.educatorName ?? "").trim(),
    amountCents: Math.max(0, Math.round(line.amountCents ?? 0)),
    hoursWorked: line.hoursWorked ?? null,
    hourlyRateCents: line.hourlyRateCents ?? null,
    childCount: line.childCount ?? null,
    dailyRateCents: line.dailyRateCents ?? null,
    employerContributionPercent: line.employerContributionPercent ?? null,
  };
}

function buildLineSummary(line: ComparableLine): string {
  const cat = CATEGORY_LABELS[line.category] ?? line.category;
  const who = line.educatorName ? ` — ${line.educatorName}` : "";
  const lbl = line.label ? ` (${line.label})` : "";
  return `${line.kind === "revenue" ? "Revenu" : "Dépense"} : ${cat}${who}${lbl}`;
}

function diffLines(
  before: ComparableLine,
  after: ComparableLine
): AccountingAuditDetail["changes"] {
  const fields: (keyof ComparableLine)[] = [
    "amountCents",
    "hoursWorked",
    "hourlyRateCents",
    "childCount",
    "dailyRateCents",
    "employerContributionPercent",
    "label",
  ];
  const changes: NonNullable<AccountingAuditDetail["changes"]> = [];
  for (const field of fields) {
    const b = before[field];
    const a = after[field];
    const bNorm = b === null || b === undefined ? null : b;
    const aNorm = a === null || a === undefined ? null : a;
    if (bNorm === aNorm) continue;
    if (field === "amountCents" && Number(bNorm) === Number(aNorm)) continue;
    changes.push({
      field,
      fieldLabel: FIELD_LABELS[field] ?? field,
      before: bNorm as string | number | null,
      after: aNorm as string | number | null,
      beforeDisplay: displayField(field, bNorm),
      afterDisplay: displayField(field, aNorm),
    });
  }
  return changes;
}

function formatJournalDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "d MMM yyyy", { locale: fr });
  } catch {
    return dateStr;
  }
}

async function writeAuditEntry(
  detail: AccountingAuditDetail,
  actorId: string,
  actorName: string,
  journalId: string | null,
  ip?: string,
  userAgent?: string
) {
  await createAuditLog({
    educatorId: actorId,
    educatorName: actorName,
    action: AUDIT_ACTIONS.ACCOUNTING_JOURNAL_LINE_CHANGED,
    resourceType: "DailyJournal",
    resourceId: journalId,
    detail: JSON.stringify(detail),
    ip: ip ?? null,
    userAgent: userAgent ?? null,
  });
}

/** Enregistre une entrée d'audit par ligne modifiée, ajoutée ou supprimée (pas la première saisie du jour). */
export async function recordAccountingJournalSaveAudit(options: {
  dateStr: string;
  before: DailyJournal | null;
  after: DailyJournal;
  actorId: string;
  actorName: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const { dateStr, before, after, actorId, actorName, ip, userAgent } = options;
  if (!before) {
    return;
  }

  const beforeMap = new Map(
    before.lines.map((l) => [toComparable(l).fingerprint, toComparable(l)])
  );
  const afterMap = new Map(
    after.lines.map((l) => [toComparable(l).fingerprint, toComparable(l)])
  );

  for (const [fp, oldLine] of Array.from(beforeMap.entries())) {
    const newLine = afterMap.get(fp);
    if (!newLine) {
      await writeAuditEntry(
        {
          journalDate: dateStr,
          changeType: "removed",
          lineSummary: buildLineSummary(oldLine),
          snapshot: {
            amountCents: oldLine.amountCents,
            hoursWorked: oldLine.hoursWorked,
            hourlyRateCents: oldLine.hourlyRateCents,
            childCount: oldLine.childCount,
          },
        },
        actorId,
        actorName,
        after.id,
        ip,
        userAgent
      );
      continue;
    }
    const changes = diffLines(oldLine, newLine) ?? [];
    if (changes.length === 0) continue;
    await writeAuditEntry(
      {
        journalDate: dateStr,
        changeType: "modified",
        lineSummary: buildLineSummary(newLine),
        changes,
      },
      actorId,
      actorName,
      after.id,
      ip,
      userAgent
    );
  }

  for (const [fp, newLine] of Array.from(afterMap.entries())) {
    if (beforeMap.has(fp)) continue;
    await writeAuditEntry(
      {
        journalDate: dateStr,
        changeType: "added",
        lineSummary: buildLineSummary(newLine),
        snapshot: {
          amountCents: newLine.amountCents,
          hoursWorked: newLine.hoursWorked,
          hourlyRateCents: newLine.hourlyRateCents,
          childCount: newLine.childCount,
        },
      },
      actorId,
      actorName,
      after.id,
      ip,
      userAgent
    );
  }
}

export async function recordAccountingJournalDeleteAudit(options: {
  dateStr: string;
  before: DailyJournal;
  actorId: string;
  actorName: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const { dateStr, before, actorId, actorName, ip, userAgent } = options;
  for (const line of before.lines) {
    const c = toComparable(line);
    await writeAuditEntry(
      {
        journalDate: dateStr,
        changeType: "removed",
        lineSummary: buildLineSummary(c),
        snapshot: {
          amountCents: c.amountCents,
          hoursWorked: c.hoursWorked,
          hourlyRateCents: c.hourlyRateCents,
          childCount: c.childCount,
        },
      },
      actorId,
      actorName,
      before.id,
      ip,
      userAgent
    );
  }
  if (before.lines.length === 0) {
    await createAuditLog({
      educatorId: actorId,
      educatorName: actorName,
      action: AUDIT_ACTIONS.ACCOUNTING_JOURNAL_DAY_DELETED,
      resourceType: "DailyJournal",
      resourceId: before.id,
      detail: JSON.stringify({
        journalDate: dateStr,
        journalDateLabel: formatJournalDate(dateStr),
        lineCount: 0,
      }),
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });
  }
}

export function parseAccountingAuditDetail(
  detail: string | null | undefined
): AccountingAuditDetail | null {
  if (!detail) return null;
  try {
    return JSON.parse(detail) as AccountingAuditDetail;
  } catch {
    return null;
  }
}

export function accountingChangeTypeLabel(changeType: AccountingAuditDetail["changeType"]): string {
  switch (changeType) {
    case "modified":
      return "Modification";
    case "added":
      return "Ajout";
    case "removed":
      return "Suppression";
    default:
      return changeType;
  }
}
