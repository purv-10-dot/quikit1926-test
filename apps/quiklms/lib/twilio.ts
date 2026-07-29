/**
 * Twilio client — voice escalation calls (teacher lateness, student reminders)
 * and SMS reminders. Used primarily by the /worker process; exposed here so
 * API routes can trigger ad-hoc sends too.
 *
 * NOTE: call/SMS orchestration (retry-up-to-3, guardianContact fallback) lives
 * in the worker (Phase 4). This is the Phase 0 client scaffold.
 */
import twilio, { type Twilio } from 'twilio';
import { optionalEnv } from './env';

let client: Twilio | null = null;

export function getTwilioClient(): Twilio | null {
  if (client) return client;
  const sid = optionalEnv('TWILIO_ACCOUNT_SID');
  const token = optionalEnv('TWILIO_AUTH_TOKEN');
  if (!sid || !token) return null;
  client = twilio(sid, token);
  return client;
}

export const TWILIO_FROM = optionalEnv('TWILIO_PHONE_NUMBER');

export async function sendSms(to: string, body: string): Promise<void> {
  const c = getTwilioClient();
  if (!c || !TWILIO_FROM) {
    // eslint-disable-next-line no-console
    console.warn('[twilio] not configured; SMS not sent to', to);
    return;
  }
  await c.messages.create({ to, from: TWILIO_FROM, body });
}
