// Email (Nodemailer) + Twilio (voice/SMS) helpers for worker jobs.
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { env } from './env.js';

let mailer: nodemailer.Transporter | null = null;
function getMailer() {
  if (mailer) return mailer;
  mailer = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return mailer;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!env.SMTP_HOST) {
    console.warn('[worker] SMTP not configured; skipping email:', subject);
    return;
  }
  await getMailer().sendMail({ from: env.SMTP_FROM, to, subject, html });
}

let twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilio() {
  if (twilioClient) return twilioClient;
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return twilioClient;
}

/**
 * Normalize a phone number to E.164 — ported verbatim from the legacy
 * `TwilioService.normalizePhone` (`src/twilio/twilio.service.ts:57-63`).
 *
 * Without this, the India-stored bare 10-digit numbers that fill
 * `User.phone` / `User.guardianContact` are rejected by Twilio's E.164
 * validation, so every escalation call and reminder SMS silently failed.
 *   - already '+'      → as-is
 *   - 10 digits        → '+91' + number  (Indian mobile)
 *   - '91' + 10 digits → '+' + number
 *   - anything else    → '+' + number
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return `+${cleaned}`;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const c = getTwilio();
  if (!c || !env.TWILIO_PHONE_NUMBER) {
    console.warn('[worker] Twilio not configured; skipping SMS to', to);
    return;
  }
  await c.messages.create({ to: normalizePhone(to), from: env.TWILIO_PHONE_NUMBER, body });
}

/** Place an automated voice call. Returns the call SID, or null if not configured. */
export async function placeCall(to: string, message: string): Promise<string | null> {
  const c = getTwilio();
  if (!c || !env.TWILIO_PHONE_NUMBER) {
    console.warn('[worker] Twilio not configured; skipping call to', to);
    return null;
  }
  // "alice" + language "en-IN" is Twilio's supported Indian-English voice
  // (`twilio.service.ts:95-103`); the "woman"/"man" voices only speak en-US.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice" language="en-IN">${message}</Say></Response>`;
  const call = await c.calls.create({ to: normalizePhone(to), from: env.TWILIO_PHONE_NUMBER, twiml, timeout: 30 });
  return call.sid;
}
