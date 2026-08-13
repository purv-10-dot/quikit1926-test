/**
 * Fathom.ai trigger app — a THIRD-PARTY source app (like `mail`), distinct from
 * the QuikScale module registry. Fathom emits a meeting event when a recording
 * finishes processing; the worker's fathom-scan poll (and the webhook route)
 * surface it as `fathom.meeting.transcribed` (app = "fathom").
 *
 * Condition fields are read straight off the event payload (no backing record),
 * so they're declared here and consumed by `conditionFieldsForEvent("fathom", …)`.
 * They also become `{{trigger.<field>}}` tokens the action params can reference.
 */
import type { CatalogApp } from "./triggers";

export const FATHOM_APP_SLUG = "fathom";
export const FATHOM_EVENT_TRANSCRIBED = "fathom.meeting.transcribed";
export const FATHOM_EVENT_RECORDED = "fathom.meeting.recorded";

const PAYLOAD_FIELDS = [
  "recordingId",
  "title",
  "meetingType",
  "clientName",
  "clientMatched",
  "startedAt",
  "durationMinutes",
  "attendeeEmails",
  "attendeeCount",
  "hasActionItems",
  "recordingUrl",
  "summary",
];

export const FATHOM_APP: CatalogApp = {
  slug: FATHOM_APP_SLUG,
  name: "Fathom.ai",
  events: [
    {
      id: FATHOM_EVENT_TRANSCRIBED,
      label: "A meeting transcript is ready",
      module: "Meetings",
      firesWhen: "Fathom finishes processing a recording and its transcript is available",
      payloadFields: PAYLOAD_FIELDS,
      live: true,
    },
    {
      id: FATHOM_EVENT_RECORDED,
      label: "A meeting is recorded",
      module: "Meetings",
      firesWhen: "Fathom finishes recording a meeting (transcript may not be ready yet)",
      payloadFields: PAYLOAD_FIELDS,
      live: true,
    },
  ],
};

/**
 * Curated action allow-list for Fathom triggers — keeps the action picker short
 * and puts "Save meeting transcript" front-and-centre instead of dumping the
 * whole ~40-action catalog (which buries it and shows irrelevant simulated KPI
 * actions). Order here doesn't matter; grouping follows ACTION_CATEGORY_ORDER.
 */
export const FATHOM_ACTION_IDS = [
  "quikscale.save_transcript",
  "notify.inapp.send",
  "notify.email.send",
  "gmail.send",
  "outlook.send",
  "www.create",
  "priority.create",
  "webhook.post",
];

/** Shape mirrors the builder's ConditionField (kept as data to avoid a cycle). */
export interface FathomConditionField {
  id: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum";
  semanticType: "text" | "number" | "dropdown" | "boolean";
  values?: string[];
}

export const FATHOM_CONDITION_FIELDS: FathomConditionField[] = [
  { id: "trigger.recordingId", label: "Recording ID", type: "string", semanticType: "text" },
  { id: "trigger.title", label: "Meeting title", type: "string", semanticType: "text" },
  {
    id: "trigger.meetingType",
    label: "Meeting type (guess)",
    type: "enum",
    semanticType: "dropdown",
    values: ["daily", "weekly", "unknown"],
  },
  { id: "trigger.clientName", label: "Matched client name", type: "string", semanticType: "text" },
  { id: "trigger.clientMatched", label: "Client matched", type: "boolean", semanticType: "boolean" },
  { id: "trigger.durationMinutes", label: "Duration (minutes)", type: "number", semanticType: "number" },
  { id: "trigger.attendeeEmails", label: "Attendee emails", type: "string", semanticType: "text" },
  { id: "trigger.attendeeCount", label: "Attendee count", type: "number", semanticType: "number" },
  { id: "trigger.hasActionItems", label: "Has action items", type: "boolean", semanticType: "boolean" },
  { id: "trigger.summary", label: "Summary", type: "string", semanticType: "text" },
];
