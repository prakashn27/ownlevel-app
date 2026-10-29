import type { EmailTransport } from "@ownlevel/core";
import { env } from "./env.js";

/** Resend when RESEND_API_KEY is set; otherwise print to the console (dev). */
export const transport: EmailTransport = async (msg) => {
  if (!env.resendApiKey) {
    console.log(`\n--- email (dev) ---\nFrom: ${msg.from}\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n-------------------\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status} ${await res.text()}`);
};

export const fromAddress = (displayName: string) => `${displayName.replace(/[<>"]/g, "")} <${env.emailFrom}>`;
