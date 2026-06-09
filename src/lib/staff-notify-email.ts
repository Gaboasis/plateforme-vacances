/**
 * Notifications e-mail au personnel (admin / secrétaire) lors de nouvelles demandes.
 *
 * Variables Railway / .env :
 *   STAFF_NOTIFY_EMAIL   — destinataire (ex. kamar@garderie.fr)
 *   RESEND_API_KEY       — clé API Resend (https://resend.com)
 *   NOTIFY_FROM_EMAIL    — expéditeur (ex. "Les Amis Bout De Choux <notifications@votredomaine.com>")
 *   APP_URL              — URL du site (ex. https://plateforme-vacances-production.up.railway.app)
 */

type NotifyKind = "vacation" | "sick" | "dayoff" | "vacation_appeal";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateFr(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getStaffNotifyConfig():
  | { to: string; from: string; apiKey: string; appUrl: string }
  | null {
  const to = process.env.STAFF_NOTIFY_EMAIL?.trim();
  const from = process.env.NOTIFY_FROM_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!to || !from || !apiKey) return null;
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return { to, from, apiKey, appUrl };
}

async function sendStaffEmail(subject: string, html: string): Promise<void> {
  const cfg = getStaffNotifyConfig();
  if (!cfg) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[staff-notify] E-mail non envoyé : STAFF_NOTIFY_EMAIL, NOTIFY_FROM_EMAIL ou RESEND_API_KEY manquant."
      );
    }
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [cfg.to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

function inboxLinks(appUrl: string): string {
  if (!appUrl) return "";
  return `<p style="margin-top:16px"><a href="${escapeHtml(appUrl)}/bureau-demandes">Ouvrir le bureau des demandes</a> · <a href="${escapeHtml(appUrl)}/admin">Administration</a></p>`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "En attente de validation";
    case "accepted":
      return "Acceptée automatiquement";
    case "rejected":
      return "Refusée automatiquement";
    default:
      return status;
  }
}

/** N’interrompt pas la requête API en cas d’échec d’envoi. */
export function notifyStaffByEmail(
  kind: NotifyKind,
  payload: Record<string, string | number | boolean | undefined | null>
): void {
  void buildAndSend(kind, payload).catch((err) => {
    console.error("[staff-notify]", kind, err);
  });
}

async function buildAndSend(
  kind: NotifyKind,
  payload: Record<string, string | number | boolean | undefined | null>
): Promise<void> {
  const cfg = getStaffNotifyConfig();
  const appUrl = cfg?.appUrl ?? "";

  let subject = "";
  let bodyHtml = "";

  switch (kind) {
    case "vacation": {
      const name = String(payload.educatorName ?? "");
      const start = formatDateFr(String(payload.startDate ?? ""));
      const end = formatDateFr(String(payload.endDate ?? ""));
      const status = String(payload.status ?? "");
      const reason = payload.reason ? String(payload.reason) : "";
      subject = `[Congés] Nouvelle demande — ${name}`;
      bodyHtml = `
        <h2>Nouvelle demande de congé</h2>
        <p><strong>${escapeHtml(name)}</strong></p>
        <p>Du ${escapeHtml(start)} au ${escapeHtml(end)}</p>
        <p>Statut : <strong>${escapeHtml(statusLabel(status))}</strong></p>
        ${reason ? `<p>Motif : ${escapeHtml(reason)}</p>` : ""}
        ${inboxLinks(appUrl)}
      `;
      break;
    }
    case "vacation_appeal": {
      const name = String(payload.educatorName ?? "");
      const start = formatDateFr(String(payload.startDate ?? ""));
      const end = formatDateFr(String(payload.endDate ?? ""));
      const appeal = String(payload.appealReason ?? "");
      subject = `[Congés] Urgence motivée — ${name}`;
      bodyHtml = `
        <h2>Urgence motivée sur un congé refusé</h2>
        <p><strong>${escapeHtml(name)}</strong></p>
        <p>Période : ${escapeHtml(start)} — ${escapeHtml(end)}</p>
        <p>Message :</p>
        <blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:8px 0">${escapeHtml(appeal)}</blockquote>
        ${inboxLinks(appUrl)}
      `;
      break;
    }
    case "sick": {
      const name = String(payload.educatorName ?? "");
      const start = formatDateFr(String(payload.startDate ?? ""));
      const end = formatDateFr(String(payload.endDate ?? ""));
      const note = payload.note ? String(payload.note) : "";
      const hasAttachment = payload.hasAttachment === true;
      subject = `[Maladie] Nouvelle déclaration — ${name}`;
      bodyHtml = `
        <h2>Déclaration d'absence maladie</h2>
        <p><strong>${escapeHtml(name)}</strong></p>
        <p>Du ${escapeHtml(start)} au ${escapeHtml(end)}</p>
        ${note ? `<p>Détail : ${escapeHtml(note)}</p>` : ""}
        <p>Pièce jointe : ${hasAttachment ? "oui" : "non"}</p>
        ${inboxLinks(appUrl)}
      `;
      break;
    }
    case "dayoff": {
      const name = String(payload.requesterName ?? "");
      const day = String(payload.requesterOffDayLabel ?? "");
      const mode = String(payload.mode ?? "");
      const target = payload.targetName ? String(payload.targetName) : "";
      const message = payload.message ? String(payload.message) : "";
      subject = `[Échange jour] Nouvelle demande — ${name}`;
      bodyHtml = `
        <h2>Demande d'échange de journée de congé</h2>
        <p><strong>${escapeHtml(name)}</strong> — jour actuel : ${escapeHtml(day)}</p>
        <p>Mode : ${mode === "targeted" ? `vers ${escapeHtml(target || "—")}` : "ouvert (toutes les collègues)"}</p>
        ${message ? `<p>Message : ${escapeHtml(message)}</p>` : ""}
        ${inboxLinks(appUrl)}
      `;
      break;
    }
  }

  await sendStaffEmail(subject, bodyHtml.trim());
}
