import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * Client Members (Meeting Rhythm) — the flat name + email roster of external
 * meeting attendees. Their emails are the primary key the Fathom matcher uses
 * to resolve which client a recording belongs to. Backed by `ClientMember`.
 */
export const CLIENT_MEMBERS_MODULE: ModuleDef = {
  key: "clientMembers",
  label: "Client Members",
  recordNoun: "a client member",
  capabilities: { trigger: true, condition: true, action: true },
  binding: { model: "clientMember", softDelete: true, readable: true },
  fields: [
    { key: "name", label: "Name", type: "text", usableIn: ["trigger", "condition"], column: "name" },
    { key: "email", label: "Email", type: "text", usableIn: ["condition"], column: "email" },
    ...auditFields({ createdBy: true, updatedBy: true }),
  ],
  events: [
    { id: "clientMember.created", label: "A client member is added", firesWhen: "A new name + email is added", payloadFields: ["name", "email"], live: true },
    { id: "clientMember.updated", label: "A client member is updated", firesWhen: "A member's name/email changes", payloadFields: ["name", "email"] },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send", "webhook.post"],
};
