/**
 * Business-event activity helpers.
 *
 * The Global Activities page (`/activities`) is the org-wide feed of every
 * user-visible CRM business event. It reads from the `CrmActivity` table, so a
 * business event only appears there if a `CrmActivity` row is written for it.
 *
 * Historically several lifecycle events (lead field edits, owner change,
 * conversion, note added, task created, contact create/update, opportunity
 * field edits, document upload) wrote only to `CrmAuditLog` — or nothing — and
 * never surfaced in the feed. These helpers close that gap by emitting one
 * concise `CrmActivity` per event, reusing the existing `logActivity()` creator
 * so owner-name resolution and idempotency behave exactly like every other
 * activity write.
 *
 * RBAC is unchanged: visibility is derived from `relatedKind` + `relatedObjectId`
 * by `buildActivityAclWhere` (and `ownerId`). Every helper here sets those two
 * fields to the real parent record, so the new rows inherit the same account /
 * ownership scoping as existing activities — no new permission logic.
 *
 * IMPORTANT: never use the reserved `type` value "LeadSystem" here — that type is
 * filtered out of the feed (`EXCLUDE_LEAD_INIT_EVENTS_WHERE`). Internal/system
 * events (e.g. `lead_convert_relink`, queue/redis/sync jobs) must stay in
 * `CrmAuditLog` and never call these helpers.
 */
import type { Prisma, PrismaClient } from "@quikit/database";
import { logActivity, type LogActivityInput } from "@/lib/services/activities/log-activity";

type Tx = PrismaClient | Prisma.TransactionClient;

/** Activity `type` strings for the business events this module writes. */
export const BUSINESS_EVENT_TYPES = {
  leadUpdated: "LeadUpdated",
  leadStatusChange: "LeadStatusChange",
  leadOwnerChange: "LeadOwnerChange",
  leadConverted: "LeadConverted",
  noteAdded: "NoteAdded",
  taskCreated: "TaskCreated",
  opportunityUpdated: "OpportunityUpdated",
  contactCreated: "ContactCreated",
  contactUpdated: "ContactUpdated",
  documentUploaded: "DocumentUploaded",
} as const;

type RelatedKind = LogActivityInput["relatedKind"];

/**
 * Human-friendly labels for tracked fields, keyed by raw field name. Used to
 * render a readable "Updated: Email, Owner, Stage" summary instead of camelCase
 * column names. Unknown fields fall back to a title-cased version of the key.
 */
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  secondaryEmail: "Secondary email",
  phone: "Phone",
  mobile: "Mobile",
  company: "Company",
  jobTitle: "Job title",
  title: "Title",
  country: "Country",
  industry: "Industry",
  website: "Website",
  linkedinUrl: "LinkedIn",
  annualRevenueDisplay: "Revenue",
  source: "Source",
  stage: "Stage",
  status: "Status",
  substatus: "Sub-status",
  score: "Score",
  ownerId: "Owner",
  ownerName: "Owner",
  accountId: "Account",
  contactStage: "Contact stage",
  city: "City",
  firstName: "First name",
  lastName: "Last name",
  amount: "Amount",
  probability: "Probability",
  currency: "Currency",
  closeDate: "Close date",
  competitorName: "Competitor",
  isStarred: "Starred",
  dynamicFields: "Custom fields",
};

function titleCase(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Render a changed-field list as "Email, Owner, Stage" (max `limit` shown). */
export function summariseChangedFields(fields: readonly string[], limit = 6): string {
  const labels = fields.map((f) => FIELD_LABELS[f] ?? titleCase(f));
  const shown = labels.slice(0, limit);
  const extra = labels.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} +${extra} more` : shown.join(", ");
}

/**
 * Compute which of the given keys actually changed between two records. Treats
 * null / undefined / "" as the same empty state and compares Dates / objects by
 * value, matching the lead change-log diff semantics.
 */
export function changedKeys(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): string[] {
  const b = before ?? {};
  const a = after ?? {};
  const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
  const eq = (x: unknown, y: unknown): boolean => {
    if (isEmpty(x) && isEmpty(y)) return true;
    if (x === y) return true;
    if (x instanceof Date && y instanceof Date) return x.getTime() === y.getTime();
    if (typeof x === "object" && x !== null && typeof y === "object" && y !== null) {
      try {
        return JSON.stringify(x) === JSON.stringify(y);
      } catch {
        return false;
      }
    }
    return false;
  };
  return keys.filter((k) => !eq((b as Record<string, unknown>)[k], (a as Record<string, unknown>)[k]));
}

/**
 * Write one business-event CrmActivity. Thin wrapper over `logActivity()` that
 * keeps the call sites short and consistent. Never throws into the caller's
 * critical path: a feed-row write must not break the underlying mutation, so
 * failures are swallowed and logged (mirrors `recordLeadChange`). Pass a `tx`
 * to keep the write inside the caller's transaction when atomicity is wanted.
 */
export async function logBusinessEvent(input: {
  orgId: string;
  userId?: string;
  ownerId?: string;
  type: string;
  relatedKind: RelatedKind;
  relatedObjectId: string;
  subject?: string;
  outcome?: string;
  detailNotes?: string;
  occurredAt?: Date;
  leadId?: string;
  opportunityId?: string;
  ownerName?: string;
  tx?: Tx;
}): Promise<void> {
  try {
    await logActivity(input);
  } catch (err) {
    console.error("[business-events] failed to write activity", {
      type: input.type,
      relatedKind: input.relatedKind,
      relatedObjectId: input.relatedObjectId,
      err,
    });
  }
}
