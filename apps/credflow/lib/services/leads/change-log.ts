import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";

export type LeadChangeAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "RESTORE"
  | "PERMANENT_DELETE";

const MODULE = "leads";

const TRACKED_FIELDS = [
  "name",
  "email",
  "phone",
  "mobile",
  "company",
  "jobTitle",
  "country",
  "industry",
  "secondaryEmail",
  "website",
  "linkedinUrl",
  "annualRevenueDisplay",
  "descriptionInformation",
  "topic",
  "technology",
  "budgetAmount",
  "budgetCurrency",
  "purchaseTimeframe",
  "leadType",
  "firstName",
  "lastName",
  "contactLinkedinUrl",
  "nextFollowUpAt",
  "lastContactedAt",
  "followupNotes",
  "internalRemarks",
  "requirementDetails",
  "addressLine1",
  "addressLine2",
  "cityName",
  "stateName",
  "postalCode",
  "lat",
  "long",
  "source",
  "stage",
  "status",
  "substatus",
  "score",
  "ownerId",
  "ownerName",
  "accountId",
  "linkedContactId",
  "isStarred",
  "dynamicFields",
  "deletedAt",
] as const;

export type TrackedField = (typeof TRACKED_FIELDS)[number];

type RecordLike = Record<string, unknown> | null | undefined;

function pickTracked(record: RecordLike): Record<string, unknown> {
  if (!record) return {};
  const out: Record<string, unknown> = {};
  for (const k of TRACKED_FIELDS) {
    if (k in record) out[k] = (record as Record<string, unknown>)[k];
  }
  return out;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

function isEqual(a: unknown, b: unknown): boolean {
  // Treat null / undefined / "" as the same "empty" state — toggling between
  // them is not a meaningful field change worth surfacing in the change log.
  if (isEmpty(a) && isEmpty(b)) return true;
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Returns `{ before, after }` containing only the fields that differ. Empty
 * `{}` means no tracked field changed.
 */
export function diffLead(
  before: RecordLike,
  after: RecordLike,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b = pickTracked(before);
  const a = pickTracked(after);
  const beforeOut: Record<string, unknown> = {};
  const afterOut: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    if (!isEqual(b[k], a[k])) {
      beforeOut[k] = b[k] ?? null;
      afterOut[k] = a[k] ?? null;
    }
  }
  return { before: beforeOut, after: afterOut };
}

interface RecordParams {
  tenantId: string;
  userId: string | null;
  leadId: string;
  action: LeadChangeAction;
  before: RecordLike;
  after: RecordLike;
  metadata?: Record<string, unknown>;
}

/**
 * Writes a single CrmAuditLog row for a lead mutation. UPDATE writes a row
 * only when at least one tracked field actually changed; the other actions
 * always write. Failures are swallowed and logged — change-log writes must
 * never break the underlying mutation.
 */
export async function recordLeadChange(params: RecordParams): Promise<void> {
  const { tenantId, userId, leadId, action, before, after, metadata } = params;
  // Prisma's `Json?` columns reject plain `null` — `Prisma.JsonNull` is the
  // sentinel that maps to a SQL NULL. We use it for actions where one side
  // of the snapshot is intentionally absent (CREATE has no `before`, DELETE
  // has no `after`).
  const jsonNull = Prisma.JsonNull;
  const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
    v as unknown as Prisma.InputJsonValue;
  const metaJson = metadata
    ? (metadata as unknown as Prisma.InputJsonValue)
    : undefined;
  try {
    if (action === "UPDATE") {
      const diff = diffLead(before, after);
      if (Object.keys(diff.after).length === 0) return;
      await prisma.crmAuditLog.create({
        data: {
          tenantId,
          userId,
          module: MODULE,
          action,
          resourceId: leadId,
          before: toJson(diff.before),
          after: toJson(diff.after),
          metadata: metaJson,
        },
      });
      return;
    }
    await prisma.crmAuditLog.create({
      data: {
        tenantId,
        userId,
        module: MODULE,
        action,
        resourceId: leadId,
        before: action === "CREATE" ? jsonNull : toJson(pickTracked(before)),
        after:
          action === "DELETE" || action === "PERMANENT_DELETE"
            ? jsonNull
            : toJson(pickTracked(after)),
        metadata: metaJson,
      },
    });
  } catch (err) {
    console.error("[change-log] failed to record lead change", { leadId, action, err });
  }
}

export const LEAD_CHANGE_LOG_MODULE = MODULE;
export const LEAD_TRACKED_FIELDS = TRACKED_FIELDS;
