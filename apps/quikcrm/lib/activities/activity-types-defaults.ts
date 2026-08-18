/**
 * Default activity types + their field definitions.
 *
 * Seeded for a tenant the first time activity types are requested (same
 * seed-on-first-read pattern as DEFAULT_LEAD_SOURCES / call dispositions /
 * pipeline stage defaults — see ensureDefaultActivityTypes).
 *
 * These are ordinary CrmActivityType / CrmActivityFieldDefinition rows once
 * seeded: admins can rename, reorder, deactivate, or extend them, and add new
 * types + fields entirely from Settings → Activity Types. Nothing here is
 * special-cased in the logging UI — the modal renders whatever fields a type
 * carries. This module only provides the STARTING configuration.
 *
 * Field-type mapping notes (the supported set is Text / TextArea / Number /
 * Email / Date / Boolean / Select / MultiSelect — there is no Phone, Time, or
 * File type, and Date has no time component):
 *   • "Phone number"        → Text   (Phone is unsupported for activity fields)
 *   • date-and-time fields  → Date   (calendar date; pair with a Text time field
 *                                      where a clock time is also wanted)
 *   • start/end/follow-up "time" → Text (free "HH:MM"; no Time field type exists)
 *   • "Attachment"          → Text   (URL / reference; no File field type yet)
 *   • "Reminder"            → Boolean (a "set a reminder" toggle)
 *
 * "Notes" is intentionally NOT defined as a per-type custom field: the log-
 * activity modal already renders an always-visible Notes textarea (stored on
 * CrmActivity.detailNotes). Adding a "notes" custom field would double it. The
 * "Note" type therefore has zero custom fields — it shows just the generic
 * Notes box, which is exactly "Notes only".
 *
 * Client-safe — no Prisma import — so it can also back UI fallbacks/tests.
 */
import type { FieldType } from "@/types/field-definition";

export interface DefaultActivityFieldDef {
  /** snake_case, unique within its type. Must match /^[a-z0-9_]+$/. */
  key: string;
  label: string;
  fieldType: Exclude<FieldType, "Phone">;
  requirement: "Required" | "Optional";
  /** Required for Select / MultiSelect. */
  options?: string[];
  helpText?: string;
}

export interface DefaultActivityType {
  /** Stable code, unique per org. Must match /^[a-z0-9_]+$/. */
  code: string;
  label: string;
  category?: string;
  /**
   * Seed value for CrmActivityType.config. Only set where a default type needs
   * non-default behavior — currently `countsSources`, which tells the Activity
   * Type-wise target tracker which record sources count toward this type.
   *
   * Omitted (the common case) means activities-only: CrmActivity rows whose
   * `type` matches this type's code. "call" additionally counts CrmCallLog rows
   * and "task" additionally counts completed CrmTask rows, because those two
   * sources carry no activity-type code but DO count toward the overall target.
   * Keeping this in config (rather than in tracker code) means an admin-created
   * type needs no code change, and an admin can retune the mapping as data.
   */
  config?: Record<string, unknown>;
  fields: DefaultActivityFieldDef[];
}

/**
 * The 12 default activity types, in display order. Each `fields` array is in
 * the order it should render (sortOrder is derived from the index at seed time).
 */
export const DEFAULT_ACTIVITY_TYPES: readonly DefaultActivityType[] = [
  {
    code: "call",
    label: "Call",
    category: "Communication",
    // Telephony call logs have no activity-type code but count toward targets.
    config: { countsSources: ["activity", "call"] },
    // NOTE ON ORDERING: fields are APPENDED, never inserted mid-array. The
    // self-healing backfill (ensure-defaults) derives sortOrder from array
    // index; inserting would renumber only NEW rows on already-seeded orgs and
    // collide with existing sortOrders. `contact_name` and `phone_number` are
    // rendered by a dedicated picker ABOVE the generic field list in the Call
    // form (log-activity-form.tsx), so their trailing position here does not
    // affect their on-screen placement — they still show first. Phone is a
    // Text field (the Phone field type is unsupported for activities and would
    // be rejected by writeActivityFieldValues); international numbers are fine
    // as free text.
    fields: [
      { key: "direction", label: "Direction", fieldType: "Select", requirement: "Required", options: ["Incoming", "Outgoing"] },
      { key: "duration_minutes", label: "Duration (minutes)", fieldType: "Number", requirement: "Optional" },
      { key: "outcome", label: "Outcome", fieldType: "Select", requirement: "Optional", options: ["Connected", "No Answer", "Busy", "Left Voicemail", "Wrong Number", "Callback Requested"] },
      { key: "call_date_time", label: "Call Date & Time", fieldType: "Date", requirement: "Optional", helpText: "Date of the call." },
      // Person called + their number. Rendered via the Call contact picker
      // (custom JSX) so they appear at the TOP of the Call form; selecting a
      // related contact auto-fills phone_number, which stays editable.
      { key: "contact_name", label: "Contact Name", fieldType: "Text", requirement: "Optional", helpText: "Person called." },
      { key: "phone_number", label: "Phone Number", fieldType: "Text", requirement: "Optional", helpText: "Auto-filled from the selected contact; editable. Supports international numbers." },
      // Telephony metadata — useful when the call was placed/logged via the
      // dialer. All optional and free-form so manual logging isn't burdened.
      { key: "call_status", label: "Call Status", fieldType: "Select", requirement: "Optional", options: ["Completed", "Missed", "Busy", "No Answer"] },
      { key: "dialed_number", label: "Dialed Number", fieldType: "Text", requirement: "Optional", helpText: "The number actually dialed (may differ from the contact's)." },
      { key: "recording_url", label: "Recording URL", fieldType: "Text", requirement: "Optional", helpText: "Link to the call recording." },
      { key: "telephony_provider", label: "Telephony Provider", fieldType: "Text", requirement: "Optional" },
      { key: "call_id", label: "Call ID", fieldType: "Text", requirement: "Optional", helpText: "Provider call/session reference." },
    ],
  },
  {
    code: "meeting",
    label: "Meeting",
    category: "Communication",
    fields: [
      { key: "meeting_date", label: "Meeting Date", fieldType: "Date", requirement: "Required" },
      { key: "start_time", label: "Start Time", fieldType: "Text", requirement: "Optional", helpText: "e.g. 14:30" },
      { key: "end_time", label: "End Time", fieldType: "Text", requirement: "Optional", helpText: "e.g. 15:00" },
      { key: "location", label: "Location", fieldType: "Text", requirement: "Optional" },
      { key: "meeting_outcome", label: "Meeting Outcome", fieldType: "Select", requirement: "Optional", options: ["Completed", "No Show", "Rescheduled", "Cancelled"] },
    ],
  },
  {
    code: "email",
    label: "Email",
    category: "Communication",
    fields: [
      { key: "recipient", label: "Recipient", fieldType: "Email", requirement: "Optional" },
      { key: "subject", label: "Subject", fieldType: "Text", requirement: "Optional" },
      { key: "email_status", label: "Email Status", fieldType: "Select", requirement: "Optional", options: ["Sent", "Delivered", "Opened", "Replied", "Bounced"] },
      { key: "attachment", label: "Attachment", fieldType: "Text", requirement: "Optional", helpText: "Link or file reference." },
    ],
  },
  {
    code: "task",
    label: "Task",
    category: "Productivity",
    // Completed CrmTask rows have no activity-type code but count toward targets.
    config: { countsSources: ["activity", "task"] },
    fields: [
      { key: "due_date", label: "Due Date", fieldType: "Date", requirement: "Optional" },
      { key: "priority", label: "Priority", fieldType: "Select", requirement: "Optional", options: ["Low", "Medium", "High", "Urgent"] },
      { key: "status", label: "Status", fieldType: "Select", requirement: "Optional", options: ["Open", "In Progress", "Completed", "Cancelled"] },
      { key: "reminder", label: "Reminder", fieldType: "Boolean", requirement: "Optional", helpText: "Set a reminder for this task." },
    ],
  },
  {
    // No custom fields — the always-visible Notes box is the whole form.
    code: "note",
    label: "Note",
    category: "General",
    fields: [],
  },
  {
    // Logged automatically by the LinkedIn extension when a conversation is
    // saved to CRM. Exactly ONE activity per prospect per calendar day,
    // regardless of how many times the user re-saves or how many messages the
    // thread contains — enforced by the (orgId, sourceSystem, externalId)
    // unique index, with the day encoded into externalId. See
    // app/api/leads/from-linkedin/route.ts.
    //
    // No custom fields: the thread itself lives on the prospect's
    // `linkedinConversation`, so duplicating message data here would be a
    // second source of truth.
    code: "linkedin_conversation",
    label: "LinkedIn Conversation",
    category: "Communication",
    fields: [],
  },
  {
    code: "whatsapp",
    label: "WhatsApp",
    category: "Communication",
    fields: [
      { key: "phone_number", label: "Phone Number", fieldType: "Text", requirement: "Optional" },
      { key: "message", label: "Message", fieldType: "TextArea", requirement: "Optional" },
      { key: "attachment", label: "Attachment", fieldType: "Text", requirement: "Optional", helpText: "Link or file reference." },
      { key: "delivery_status", label: "Delivery Status", fieldType: "Select", requirement: "Optional", options: ["Sent", "Delivered", "Read", "Failed"] },
    ],
  },
  {
    code: "demo",
    label: "Demo",
    category: "Sales",
    fields: [
      { key: "demo_date", label: "Demo Date", fieldType: "Date", requirement: "Required" },
      { key: "demo_type", label: "Demo Type", fieldType: "Select", requirement: "Optional", options: ["Online", "Offline"] },
      { key: "demo_result", label: "Demo Result", fieldType: "Select", requirement: "Optional", options: ["Interested", "Not Interested", "Needs Follow-up", "No Show"] },
    ],
  },
  {
    code: "site_visit",
    label: "Site Visit",
    category: "Sales",
    fields: [
      { key: "visit_date", label: "Visit Date", fieldType: "Date", requirement: "Required" },
      { key: "location", label: "Location", fieldType: "Text", requirement: "Optional" },
      { key: "visit_outcome", label: "Visit Outcome", fieldType: "Select", requirement: "Optional", options: ["Completed", "Rescheduled", "Cancelled", "No Show"] },
    ],
  },
  {
    code: "proposal_sent",
    label: "Proposal Sent",
    category: "Sales",
    fields: [
      { key: "proposal_name", label: "Proposal Name", fieldType: "Text", requirement: "Optional" },
      { key: "proposal_date", label: "Proposal Date", fieldType: "Date", requirement: "Optional" },
      { key: "proposal_status", label: "Proposal Status", fieldType: "Select", requirement: "Optional", options: ["Draft", "Sent", "Viewed", "Accepted", "Rejected"] },
    ],
  },
  {
    code: "quote_sent",
    label: "Quote Sent",
    category: "Sales",
    fields: [
      { key: "quote_number", label: "Quote Number", fieldType: "Text", requirement: "Optional" },
      { key: "quote_amount", label: "Quote Amount", fieldType: "Number", requirement: "Optional" },
      { key: "quote_date", label: "Quote Date", fieldType: "Date", requirement: "Optional" },
    ],
  },
  {
    code: "document_shared",
    label: "Document Shared",
    category: "General",
    fields: [
      { key: "document_name", label: "Document Name", fieldType: "Text", requirement: "Optional" },
      { key: "document_type", label: "Document Type", fieldType: "Select", requirement: "Optional", options: ["Contract", "Invoice", "Brochure", "Presentation", "Specification", "Other"] },
      { key: "attachment", label: "Attachment", fieldType: "Text", requirement: "Optional", helpText: "Link or file reference." },
    ],
  },
  {
    code: "follow_up",
    label: "Follow-up",
    category: "Productivity",
    fields: [
      { key: "follow_up_date", label: "Follow-up Date", fieldType: "Date", requirement: "Optional" },
      { key: "follow_up_time", label: "Follow-up Time", fieldType: "Text", requirement: "Optional", helpText: "e.g. 10:00" },
      { key: "reminder", label: "Reminder", fieldType: "Boolean", requirement: "Optional", helpText: "Set a reminder for this follow-up." },
      { key: "follow_up_outcome", label: "Follow-up Outcome", fieldType: "Select", requirement: "Optional", options: ["Pending", "Completed", "No Response", "Rescheduled"] },
    ],
  },
] as const;
