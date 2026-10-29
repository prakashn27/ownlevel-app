import { usageEvents, withTenant, type Db } from "../../db/index.js";

export type EmailMessage = { from: string; to: string; subject: string; text: string; html?: string };
/** Delivery is injected by the adapter (Resend, SES, console in dev). */
export type EmailTransport = (msg: EmailMessage) => Promise<void>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Sends an email and writes the usage ledger entry for the agency (and client, when scoped). */
export async function sendEmail(
  db: Db,
  transport: EmailTransport,
  scope: { agencyId: string; clientId?: string | null },
  msg: EmailMessage,
) {
  await transport(msg);
  await withTenant(db, { agencyId: scope.agencyId }, (tx) =>
    tx.insert(usageEvents).values({
      agencyId: scope.agencyId,
      clientId: scope.clientId ?? null,
      meter: "email.sent",
      quantity: "1",
    }),
  );
}

function layout(appName: string, body: string, cta: { label: string; url: string }) {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
<h2>${esc(appName)}</h2>${body}
<p><a href="${esc(cta.url)}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">${esc(cta.label)}</a></p>
<p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${esc(cta.url)}</p></div>`;
}

export function inviteEmail(p: { appName: string; inviterName: string; roleName: string; url: string }) {
  const text = `${p.inviterName} invited you to join ${p.appName} as ${p.roleName}.\n\nAccept the invitation: ${p.url}\n\nThis link expires in 7 days.`;
  return {
    subject: `You're invited to ${p.appName}`,
    text,
    html: layout(p.appName, `<p>${esc(p.inviterName)} invited you to join <b>${esc(p.appName)}</b> as ${esc(p.roleName)}.</p><p>This link expires in 7 days.</p>`, { label: "Accept invitation", url: p.url }),
  };
}

export function resetPasswordEmail(p: { appName: string; url: string }) {
  const text = `Reset your ${p.appName} password: ${p.url}\n\nIf you didn't ask for this, you can ignore this email.`;
  return {
    subject: `Reset your ${p.appName} password`,
    text,
    html: layout(p.appName, `<p>We got a request to reset your password. If it wasn't you, ignore this email.</p>`, { label: "Reset password", url: p.url }),
  };
}
