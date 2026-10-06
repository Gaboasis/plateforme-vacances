import { verifyPassword } from "./auth";
import { canModifyLockedJournalDay } from "./journal-day-editors";
import { prisma } from "./db";
import { getDailyJournal } from "./store-accounting";
import { getEducators } from "./store";

export async function assertCanEditLockedJournalDay(options: {
  dateStr: string;
  actorId: string;
  editPassword?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const existing = await getDailyJournal(options.dateStr);
  if (!existing) {
    return { ok: true };
  }

  const educators = await getEducators();
  const actor = educators.find((x) => x.id === options.actorId.trim());
  if (!actor || !canModifyLockedJournalDay(actor)) {
    return {
      ok: false,
      status: 403,
      error:
        "Seuls l'administrateur, Kamar et Loubaba peuvent modifier une journée déjà enregistrée.",
    };
  }

  const pwd = options.editPassword?.trim() ?? "";
  if (!pwd) {
    return {
      ok: false,
      status: 409,
      error:
        "Cette journée est déjà enregistrée. Entrez votre mot de passe pour la modifier.",
    };
  }

  const row = await prisma.educator.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true },
  });
  if (!row?.passwordHash || !verifyPassword(pwd, row.passwordHash)) {
    return {
      ok: false,
      status: 403,
      error: "Mot de passe incorrect.",
    };
  }

  return { ok: true };
}
