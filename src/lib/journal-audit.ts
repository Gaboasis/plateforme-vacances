import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { DailyJournal, JournalLine, JournalLineCategory } from "@/types";
import type { JournalLineInput } from "./store-accounting";
import { normalizeClockTime } from "./payroll-work-hours";
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
  clockIn: string | null;
  clockOut: string | null;
  note: string;
  sourceName: string;
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
    clockIn?: string | null;
    clockOut?: string | null;
  };
};

function formatMoney(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} $`;
}

function formatHours(h: number): string {
  return `${h.toFixed(2).replace(".", ",")} h`;
}

const FIELD_LABELS: Record<string, string> = {
  clockIn: "Pointage — heure d'entrée",
  clockOut: "Pointage — heure de sortie",
  amountCents: "Montant brut",
  hoursWorked: "Heures payables",
  hourlyRateCents: "Taux horaire",
  childCount: "Nombre d'enfants",
  dailyRateCents: "Tarif journalier",
  employerContributionPercent: "Cotisations employeur (%)",
  label: "Libellé",
  note: "Note (ligne)",
  sourceName: "Fournisseur / source",
  notes: "Notes du journal",
};

function normClockForAudit(value: string | null | undefined): string | null {
  const n = normalizeClockTime(value ?? undefined);
  return n ?? null;
}

function displayField(field: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "clockIn" || field === "clockOut") {
    return normClockForAudit(String(value)) ?? "—";
  }
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
  accountingPeriodStart?: string | null;
  splitGroupId?: string | null;
}): string {
  const base = [
    line.kind,
    line.category,
    (line.educatorId ?? "").trim(),
    (line.label ?? "").trim().toLowerCase(),
  ];
  if (line.category === "expense_other" && line.accountingPeriodStart) {
    base.push(
      String(line.accountingPeriodStart).slice(0, 10),
      (line.splitGroupId ?? "").trim()
    );
  }
  return base.join("|");
}

function toComparable(
  line: JournalLine | JournalLineInput
): ComparableLine {
  return {
    fingerprint: lineFingerprint({
      kind: line.kind,
      category: line.category,
      educatorId: line.educatorId,
      label: line.label,
      accountingPeriodStart: line.accountingPeriodStart ?? null,
      splitGroupId: line.splitGroupId ?? null,
    }),
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
    clockIn: normClockForAudit(line.clockIn ?? undefined),
    clockOut: normClockForAudit(line.clockOut ?? undefined),
    note: (line.note ?? "").trim(),
    sourceName: (line.sourceName ?? "").trim(),
  };
}

function buildLineSummary(line: ComparableLine): string {
  const cat = CATEGORY_LABELS[line.category] ?? line.category;
  const who = line.educatorName ? ` — ${line.educatorName}` : "";
  const lbl = line.label ? ` (${line.label})` : "";
  let summary = `${line.kind === "revenue" ? "Revenu" : "Dépense"} : ${cat}${who}${lbl}`;
  if (
    line.category === "expense_educator_gross" &&
    (line.clockIn || line.clockOut)
  ) {
    summary += ` · pointage ${displayField("clockIn", line.clockIn)} → ${displayField("clockOut", line.clockOut)}`;
  }
  return summary;
}

function diffLines(
  before: ComparableLine,
  after: ComparableLine
): AccountingAuditDetail["changes"] {
  const fields: (keyof ComparableLine)[] = [
    "clockIn",
    "clockOut",
    "hoursWorked",
    "amountCents",
    "hourlyRateCents",
    "childCount",
    "dailyRateCents",
    "employerContributionPercent",
    "label",
    "note",
    "sourceName",
  ];
  const changes: NonNullable<AccountingAuditDetail["changes"]> = [];
  for (const field of fields) {
    const b = before[field];
    const a = after[field];
    let bNorm = b === null || b === undefined || b === "" ? null : b;
    let aNorm = a === null || a === undefined || a === "" ? null : a;
    if (field === "clockIn" || field === "clockOut") {
      bNorm = normClockForAudit(bNorm as string | null);
      aNorm = normClockForAudit(aNorm as string | null);
    }
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

async function recordJournalNotesChange(
  dateStr: string,
  beforeNotes: string,
  afterNotes: string,
  actorId: string,
  actorName: string,
  journalId: string,
  ip?: string,
  userAgent?: string
) {
  if (beforeNotes === afterNotes) return;
  await writeAuditEntry(
    {
      journalDate: dateStr,
      changeType: "modified",
      lineSummary: "Notes du journal",
      changes: [
        {
          field: "notes",
          fieldLabel: FIELD_LABELS.notes ?? "Notes du journal",
          before: beforeNotes || null,
          after: afterNotes || null,
          beforeDisplay: beforeNotes || "—",
          afterDisplay: afterNotes || "—",
        },
      ],
    },
    actorId,
    actorName,
    journalId,
    ip,
    userAgent
  );
}

/** Enregistre une entrée d'audit par ligne modifiée, ajoutée ou supprimée (y compris première saisie du jour). */
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

  const afterNotes = (after.notes ?? "").trim();

  if (!before) {
    for (const line of after.lines) {
      const newLine = toComparable(line);
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
            clockIn: newLine.clockIn,
            clockOut: newLine.clockOut,
          },
        },
        actorId,
        actorName,
        after.id,
        ip,
        userAgent
      );
    }
    if (afterNotes) {
      await recordJournalNotesChange(
        dateStr,
        "",
        afterNotes,
        actorId,
        actorName,
        after.id,
        ip,
        userAgent
      );
    }
    return;
  }

  const beforeNotes = (before.notes ?? "").trim();
  await recordJournalNotesChange(
    dateStr,
    beforeNotes,
    afterNotes,
    actorId,
    actorName,
    after.id,
    ip,
    userAgent
  );

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
            clockIn: oldLine.clockIn,
            clockOut: oldLine.clockOut,
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
          clockIn: newLine.clockIn,
          clockOut: newLine.clockOut,
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

/** Dépenses fixes (hors lignes du journal) — affichées à la compta du jour. */
export async function recordAccountingFixedExpenseAudit(options: {
  journalDate: string;
  changeType: "added" | "removed";
  label: string;
  amountCents: number;
  sourceName?: string;
  note?: string;
  actorId: string;
  actorName: string;
  resourceId?: string | null;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const who = options.sourceName?.trim();
  const extra = options.note?.trim();
  const lineSummary = `Dépense fixe : ${options.label}${who ? ` (${who})` : ""}`;
  const snapshot = {
    amountCents: options.amountCents,
  };
  await writeAuditEntry(
    {
      journalDate: options.journalDate,
      changeType: options.changeType,
      lineSummary,
      snapshot,
      changes:
        options.changeType === "added" && extra
          ? [
              {
                field: "note",
                fieldLabel: FIELD_LABELS.note ?? "Note",
                before: null,
                after: extra,
                beforeDisplay: "—",
                afterDisplay: extra,
              },
            ]
          : undefined,
    },
    options.actorId,
    options.actorName,
    options.resourceId ?? null,
    options.ip,
    options.userAgent
  );
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
          clockIn: c.clockIn,
          clockOut: c.clockOut,
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
