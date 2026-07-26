/**
 * Email (Gmail / Outlook) trigger app — a THIRD-PARTY source app, distinct from
 * the QuikScale module registry. Inbound messages are surfaced by the worker's
 * mail-scan poll as `mail.email.received` events (app = "mail"), which the
 * builder authors and the engine matches like any other event.
 *
 * Condition fields (from / subject / …) are read straight off the event payload
 * — there's no backing record to load — so they're declared here and consumed
 * by `conditionFieldsForEvent("mail", …)`.
 */
import type { CatalogApp } from "./triggers";

export const MAIL_APP_SLUG = "mail";
export const MAIL_EVENT_ID = "mail.email.received";

export const MAIL_APP: CatalogApp = {
  slug: MAIL_APP_SLUG,
  name: "Email (Gmail / Outlook)",
  events: [
    {
      id: MAIL_EVENT_ID,
      label: "A new email is received",
      module: "Email",
      firesWhen: "A new message lands in a connected Gmail or Outlook inbox",
      payloadFields: ["from", "fromName", "to", "cc", "subject", "snippet", "provider", "receivedAt", "hasAttachments"],
      live: true,
    },
  ],
};

/** Shape mirrors the builder's ConditionField (kept as data to avoid a cycle). */
export interface MailConditionField {
  id: string;
  label: string;
  type: "string" | "boolean" | "enum";
  semanticType: "text" | "dropdown" | "boolean";
  values?: string[];
}

export const MAIL_CONDITION_FIELDS: MailConditionField[] = [
  { id: "trigger.from", label: "From (email)", type: "string", semanticType: "text" },
  { id: "trigger.fromName", label: "From (name)", type: "string", semanticType: "text" },
  { id: "trigger.to", label: "To", type: "string", semanticType: "text" },
  { id: "trigger.cc", label: "Cc", type: "string", semanticType: "text" },
  { id: "trigger.subject", label: "Subject", type: "string", semanticType: "text" },
  { id: "trigger.snippet", label: "Body preview", type: "string", semanticType: "text" },
  { id: "trigger.provider", label: "Mailbox provider", type: "enum", semanticType: "dropdown", values: ["gmail", "outlook"] },
  { id: "trigger.hasAttachments", label: "Has attachments", type: "boolean", semanticType: "boolean" },
];
