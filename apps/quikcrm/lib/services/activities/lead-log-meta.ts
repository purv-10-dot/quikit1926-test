// Canonical port of quikcrm-backend/src/activities/lead-log.meta.ts.
// Diffed against the Next.js app on 2026-05-05 — no existing copy found,
// so this is the single source of truth. If the telephony module ever
// adds an overlapping enum, dedupe by re-exporting from here.

export const LEAD_LOG_ACTIVITY_CODES = [
  "01. Call Conversation",
  "02. Email",
  "03. Meeting",
  "04. SMS / WhatsApp",
  "05. Task note",
] as const;

export const LEAD_LOG_OUTCOMES = [
  "Follow-Up",
  "Schedule Appointment",
  "Not Interested",
  "Not Reachable",
  "Switch Off",
  "Interested",
  "Busy",
  "Wrong Number",
] as const;

export type LeadLogActivityCode = (typeof LEAD_LOG_ACTIVITY_CODES)[number];
export type LeadLogOutcome = (typeof LEAD_LOG_OUTCOMES)[number];

export function getLeadLogMetaResponse() {
  return {
    activityCodes: [...LEAD_LOG_ACTIVITY_CODES],
    outcomes: [...LEAD_LOG_OUTCOMES],
  };
}

export function isLeadLogActivityCode(v: string): v is LeadLogActivityCode {
  return (LEAD_LOG_ACTIVITY_CODES as readonly string[]).includes(v);
}

export function isLeadLogOutcome(v: string): v is LeadLogOutcome {
  return (LEAD_LOG_OUTCOMES as readonly string[]).includes(v);
}
