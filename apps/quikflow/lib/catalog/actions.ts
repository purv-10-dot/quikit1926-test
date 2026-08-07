/**
 * Action catalog — everything a workflow can DO, from QuikScale-Workflow-Spec
 * (sheet 3 · Actions), grouped by category for the builder's picker.
 *
 * `real: true` marks actions the engine executes for real today (they hit
 * QuikScale's internal action endpoints — see lib/engine/actions.ts). Every
 * other action is authorable but SIMULATED at runtime (recorded, no side
 * effect) until its executor is implemented — shown with a "simulated" tag.
 */
export interface CatalogAction {
  id: string;
  label: string;
  category: string;
  doesWhat: string;
  requiredInputs: string[];
  optionalInputs: string[];
  permission: string;
  output: string;
  real?: boolean;
}

export const ACTION_CATALOG: CatalogAction[] = [
  // ── Notify ───────────────────────────────────────────────────────────────
  { id: "notify.inapp.send", label: "Send an in-app notification", category: "Notify", doesWhat: "In-app notification", requiredInputs: ["user_id", "title", "body"], optionalInputs: ["link_url", "priority", "expires_at"], permission: "none", output: "{ notification_id }", real: true },
  { id: "notify.email.send", label: "Send an email (connected mailbox)", category: "Notify", doesWhat: "Send email from any connected Gmail/Outlook account", requiredInputs: ["to", "subject", "body"], optionalInputs: ["cc", "bcc", "html"], permission: "integration:mail", output: "{ message_id }", real: true },
  { id: "gmail.send", label: "Send an email via Gmail", category: "Notify", doesWhat: "Send email from a connected Gmail account", requiredInputs: ["to", "subject", "body"], optionalInputs: ["cc", "bcc", "html"], permission: "integration:gmail", output: "{ message_id }", real: true },
  { id: "outlook.send", label: "Send an email via Outlook", category: "Notify", doesWhat: "Send email from a connected Outlook account", requiredInputs: ["to", "subject", "body"], optionalInputs: ["cc", "bcc", "html"], permission: "integration:outlook", output: "{ message_id }", real: true },
  { id: "notify.slack.send", label: "Post to Slack", category: "Notify", doesWhat: "Send to Slack channel", requiredInputs: ["channel", "text"], optionalInputs: ["blocks[]", "thread_ts"], permission: "integration:slack", output: "{ message_ts }" },
  { id: "notify.teams.send", label: "Post to Microsoft Teams", category: "Notify", doesWhat: "Send to MS Teams", requiredInputs: ["channel_id", "text"], optionalInputs: ["card"], permission: "integration:teams", output: "{ message_id }" },
  { id: "notify.whatsapp.send", label: "Send a WhatsApp message", category: "Notify", doesWhat: "Send WhatsApp msg", requiredInputs: ["user_id", "template_name", "params[]"], optionalInputs: [], permission: "integration:whatsapp", output: "{ message_id }" },

  // ── Calendar & meetings ────────────────────────────────────────────────
  { id: "calendar.event.create", label: "Create a Teams calendar meeting", category: "Calendar", doesWhat: "For Client Master: set kind = daily OR weekly and leave the rest blank — subject, times, attendees, recurrence days & until all auto-fill from the client. (Advanced: override any of them, or use start_time/end_time + date for a non-Client-Master event.)", requiredInputs: ["subject"], optionalInputs: ["kind", "start_time", "end_time", "start", "end", "date", "attendees", "recurrence", "recurrence_days", "recurrence_until", "body", "location", "timezone", "online_meeting", "ref_id", "from_connection"], permission: "integration:teams", output: "{ event_id, web_link, join_url, updated }", real: true },
  { id: "calendar.event.delete", label: "Delete Teams calendar meeting(s)", category: "Calendar", doesWhat: "Delete the calendar event(s) a workflow created for a record — all kinds, or a specific kind. Idempotent; safe if already removed.", requiredInputs: [], optionalInputs: ["kind", "ref_id", "ref_type"], permission: "integration:teams", output: "{ deleted }", real: true },

  // ── KPI ────────────────────────────────────────────────────────────────
  { id: "kpi.create", label: "Create a KPI", category: "KPI", doesWhat: "Create a KPI", requiredInputs: ["name", "owner_id", "target", "cadence", "unit", "type"], optionalInputs: ["linked_to_opsp", "is_ai_suggested", "source_type", "source_id"], permission: "kpi.write", output: "Kpi", real: true },
  { id: "kpi.update", label: "Update KPI fields", category: "KPI", doesWhat: "Update KPI fields", requiredInputs: ["kpi_id", "fields{}"], optionalInputs: ["note"], permission: "kpi.write", output: "Kpi", real: true },
  { id: "kpi.value.enter", label: "Enter a weekly KPI value", category: "KPI", doesWhat: "Enter weekly value", requiredInputs: ["kpi_id", "week_number", "value"], optionalInputs: ["note"], permission: "kpi.write", output: "KpiWeekEntry", real: true },
  { id: "kpi.delete", label: "Delete a KPI", category: "KPI", doesWhat: "Delete KPI", requiredInputs: ["kpi_id"], optionalInputs: ["reason"], permission: "kpi.delete", output: "{ deleted: true }" },
  { id: "kpi.archive", label: "Archive a KPI", category: "KPI", doesWhat: "Archive KPI", requiredInputs: ["kpi_id"], optionalInputs: [], permission: "kpi.write", output: "Kpi", real: true },
  { id: "kpi.ai.suggest", label: "Run an AI KPI suggestion", category: "KPI", doesWhat: "Run AI suggestion", requiredInputs: ["user_id", "sources[]"], optionalInputs: ["prompt"], permission: "ai.use", output: "Kpi[]" },
  { id: "kpi.rag.set", label: "Set a KPI's health status (Red / Yellow / Green)", category: "KPI", doesWhat: "Set the health status explicitly", requiredInputs: ["kpi_id", "rag"], optionalInputs: [], permission: "kpi.write", output: "Kpi" },
  { id: "kpi.export", label: "Export KPI history", category: "KPI", doesWhat: "Export KPI history", requiredInputs: ["filter{}", "format"], optionalInputs: [], permission: "kpi.read", output: "{ url }" },

  // ── Priority ─────────────────────────────────────────────────────────────
  { id: "priority.create", label: "Create a priority", category: "Priority", doesWhat: "Create Priority", requiredInputs: ["title", "owner_id", "due_date"], optionalInputs: ["linked_kpi_id", "description"], permission: "priority.write", output: "Priority", real: true },
  { id: "priority.update", label: "Update a priority", category: "Priority", doesWhat: "Update fields", requiredInputs: ["priority_id", "fields{}"], optionalInputs: [], permission: "priority.write", output: "Priority", real: true },
  { id: "priority.complete", label: "Mark a priority complete", category: "Priority", doesWhat: "Mark complete", requiredInputs: ["priority_id"], optionalInputs: ["note"], permission: "priority.write", output: "Priority", real: true },
  { id: "priority.reassign", label: "Reassign a priority", category: "Priority", doesWhat: "Change owner", requiredInputs: ["priority_id", "new_owner_id"], optionalInputs: [], permission: "priority.write", output: "Priority", real: true },

  // ── WWW ──────────────────────────────────────────────────────────────────
  { id: "www.create", label: "Add a WWW item", category: "WWW", doesWhat: "Add WWW item", requiredInputs: ["who", "what", "when"], optionalInputs: [], permission: "www.write", output: "Www", real: true },
  { id: "www.complete", label: "Complete a WWW item", category: "WWW", doesWhat: "Mark done", requiredInputs: ["www_id"], optionalInputs: [], permission: "www.write", output: "Www", real: true },
  { id: "www.bulk.import", label: "Bulk-import WWW items", category: "WWW", doesWhat: "Bulk create from AI meeting", requiredInputs: ["items[]"], optionalInputs: [], permission: "www.write", output: "Www[]", real: true },

  // ── OPSP ───────────────────────────────────────────────────────────────
  { id: "opsp.update.section", label: "Update an OPSP section", category: "OPSP", doesWhat: "Update section content", requiredInputs: ["opsp_id", "section_name", "content"], optionalInputs: [], permission: "opsp.write", output: "Opsp" },
  { id: "opsp.finalize", label: "Finalize an OPSP", category: "OPSP", doesWhat: "Finalize OPSP (locks all)", requiredInputs: ["opsp_id"], optionalInputs: [], permission: "opsp.finalize", output: "Opsp", real: true },
  { id: "opsp.review.mark", label: "Mark an OPSP reviewed", category: "OPSP", doesWhat: "Mark Reviewed", requiredInputs: ["opsp_id"], optionalInputs: [], permission: "opsp.review", output: "Opsp", real: true },
  { id: "opsp.unlock", label: "Unlock an OPSP (Super Admin)", category: "OPSP", doesWhat: "Super Admin override", requiredInputs: ["opsp_id", "reason"], optionalInputs: [], permission: "opsp.accountability.override", output: "Opsp" },
  { id: "opsp.duplicate.next_quarter", label: "Duplicate an OPSP for next quarter", category: "OPSP", doesWhat: "Duplicate for next Q", requiredInputs: ["opsp_id"], optionalInputs: [], permission: "opsp.write", output: "Opsp" },
  { id: "opsp.export.pdf", label: "Export an OPSP as PDF", category: "OPSP", doesWhat: "Export as PDF", requiredInputs: ["opsp_id"], optionalInputs: ["hide_ya_users[]"], permission: "opsp.read", output: "{ url }" },

  // ── People ─────────────────────────────────────────────────────────────
  { id: "face.seat.assign", label: "Assign a FACe seat", category: "People", doesWhat: "Put person in seat", requiredInputs: ["seat_id", "user_id"], optionalInputs: [], permission: "face.write", output: "FaceSeat" },
  { id: "face.seat.vacate", label: "Vacate a FACe seat", category: "People", doesWhat: "Clear seat", requiredInputs: ["seat_id"], optionalInputs: ["reason"], permission: "face.write", output: "FaceSeat" },
  { id: "pace.process.update", label: "Update a PACe process", category: "People", doesWhat: "Update process", requiredInputs: ["process_id", "fields{}"], optionalInputs: [], permission: "pace.write", output: "PaceProcess" },

  // ── Data / Integrations ──────────────────────────────────────────────────
  { id: "webhook.post", label: "POST to a webhook URL", category: "Data", doesWhat: "POST to a webhook URL", requiredInputs: ["url", "payload{}"], optionalInputs: ["headers"], permission: "webhook.send", output: "{ status, body }", real: true },
  { id: "quikscale.save_transcript", label: "Save meeting transcript to QuikScale", category: "Data", doesWhat: "Match a Fathom meeting to a client & save its transcript into Meeting Rhythm", requiredInputs: [], optionalInputs: ["recordingId", "clientId", "type", "meetingDate"], permission: "clientMeetings.write", output: "{ transcriptId, matchStatus }", real: true },
  { id: "zapier.emit", label: "Fire a Zapier hook", category: "Data", doesWhat: "Fire Zapier hook", requiredInputs: ["hook_id", "payload{}"], optionalInputs: [], permission: "integration:zapier", output: "{ emitted }" },
  { id: "integration.gsheet.append", label: "Append a row to Google Sheets", category: "Data", doesWhat: "Append row to Google Sheet", requiredInputs: ["sheet_id", "row[]"], optionalInputs: [], permission: "integration:gsheet", output: "{ row_index }" },
  { id: "integration.stripe.pull", label: "Pull a metric from Stripe", category: "Data", doesWhat: "Pull metric from Stripe", requiredInputs: ["metric", "date_range"], optionalInputs: [], permission: "integration:stripe", output: "{ value }" },

  // ── Admin ──────────────────────────────────────────────────────────────
  { id: "user.invite", label: "Invite a new user", category: "Admin", doesWhat: "Invite new user", requiredInputs: ["email", "role"], optionalInputs: ["team_id"], permission: "user.invite", output: "{ invitation_id }" },
  { id: "user.deactivate", label: "Deactivate a user", category: "Admin", doesWhat: "Deactivate user", requiredInputs: ["user_id"], optionalInputs: ["reason"], permission: "user.admin", output: "{ deactivated }" },
  { id: "permission.grant", label: "Grant a permission", category: "Admin", doesWhat: "Grant permission", requiredInputs: ["user_id", "permission"], optionalInputs: [], permission: "user.admin", output: "{ granted }" },
  { id: "setting.update", label: "Change a company setting", category: "Admin", doesWhat: "Change Company Setting", requiredInputs: ["key", "value"], optionalInputs: [], permission: "admin.settings", output: "{ updated }" },

  // ── Flow control ─────────────────────────────────────────────────────────
  { id: "flow.wait", label: "Wait / delay", category: "Flow", doesWhat: "Delay before next action", requiredInputs: ["duration"], optionalInputs: [], permission: "none", output: "-" },
  { id: "flow.branch", label: "If / else branch", category: "Flow", doesWhat: "If/else branching", requiredInputs: ["condition", "then_actions[]", "else_actions[]"], optionalInputs: [], permission: "none", output: "-" },
  { id: "flow.loop.foreach", label: "Loop over a list", category: "Flow", doesWhat: "Iterate over array", requiredInputs: ["over", "as", "actions[]"], optionalInputs: [], permission: "none", output: "-" },
  { id: "flow.abort", label: "Stop the workflow", category: "Flow", doesWhat: "Stop workflow", requiredInputs: ["reason"], optionalInputs: [], permission: "none", output: "-" },
  { id: "flow.trigger.workflow", label: "Kick off another workflow", category: "Flow", doesWhat: "Kick off another workflow", requiredInputs: ["workflow_id", "payload{}"], optionalInputs: [], permission: "workflows.trigger", output: "{ run_id }" },
];

/** Category display order for the builder's grouped action picker. */
export const ACTION_CATEGORY_ORDER = ["Notify", "Calendar", "KPI", "Priority", "WWW", "OPSP", "People", "Data", "Admin", "Flow"];

/** Actions grouped by category, in ACTION_CATEGORY_ORDER. */
export function actionsByCategory(): { category: string; actions: CatalogAction[] }[] {
  return ACTION_CATEGORY_ORDER.map((category) => ({
    category,
    actions: ACTION_CATALOG.filter((a) => a.category === category),
  })).filter((g) => g.actions.length > 0);
}

/** Look up a single action by id. */
export function findAction(id: string | undefined): CatalogAction | undefined {
  return id ? ACTION_CATALOG.find((a) => a.id === id) : undefined;
}
