/**
 * Server-side writer for LinkedIn extension activities.
 *
 * Generic over the LINKEDIN_ACTIVITY_TYPES registry: the caller names a type
 * and this resolves the subject/description, builds the dedupe key, and hands
 * off to the shared logActivity() upsert. Adding a future LinkedIn action needs
 * no change here.
 */
import { db } from "@/lib/db";
import { logActivity } from "@/lib/services/activities/log-activity";
import {
  STANDALONE_KIND,
  STANDALONE_RELATED_ID,
} from "@/lib/services/activities/target-existence";
import {
  LINKEDIN_ACTIVITY_TYPES,
  LINKEDIN_SOURCE_LABEL,
  LINKEDIN_SOURCE_SYSTEM,
  buildLinkedInActivityExternalId,
  type LinkedInActivityType,
} from "@/lib/services/activities/linkedin-activity-types";

export type LogLinkedInActivityInput = {
  orgId: string;
  userId: string;
  /** Display name of the acting user, for the `initiatedBy` metadata field. */
  initiatedBy: string;
  prospectId: string;
  activityType: LinkedInActivityType;
  linkedinProfileUrl?: string;
  /** Falls back to the stored prospect name when the client omits it. */
  profileName?: string;
  company?: string;
  occurredAt: Date;
};

export type LogLinkedInActivityResult =
  | { ok: true; activityId: string; duplicate: boolean }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Verify the prospect belongs to the caller's org, then log the activity.
 *
 * The prospect lookup is itself the org-isolation check: a prospect id from
 * another tenant simply does not match `{ id, orgId }` and returns 404, so a
 * caller cannot attach activities to another org's records by guessing a cuid.
 */
export async function logLinkedInActivity(
  input: LogLinkedInActivityInput,
): Promise<LogLinkedInActivityResult> {
  const descriptor = LINKEDIN_ACTIVITY_TYPES[input.activityType];

  const prospect = await db.crmProspect.findFirst({
    where: { id: input.prospectId, orgId: input.orgId },
    select: { id: true, name: true, company: true, linkedinUrl: true },
  });
  if (!prospect) {
    return { ok: false, status: 404, error: "Prospect not found" };
  }

  // Prefer what the extension observed on the live page; fall back to the
  // stored record so the description is never blank.
  const profileName = input.profileName?.trim() || prospect.name;
  const company = input.company?.trim() || prospect.company || null;
  const linkedinProfileUrl =
    input.linkedinProfileUrl?.trim() || prospect.linkedinUrl || null;

  const externalId = buildLinkedInActivityExternalId(
    input.activityType,
    prospect.id,
    input.occurredAt,
  );

  // Detect the replay before writing, purely so the response can tell the
  // extension "already logged" instead of "created". logActivity() is the
  // actual guarantee — it upserts on (orgId, sourceSystem, externalId), so two
  // concurrent clicks cannot produce two rows even if both pass this check.
  const existing = await db.crmActivity.findUnique({
    where: {
      orgId_sourceSystem_externalId: {
        orgId: input.orgId,
        sourceSystem: LINKEDIN_SOURCE_SYSTEM,
        externalId,
      },
    },
    select: { id: true },
  });

  const activity = await logActivity({
    orgId: input.orgId,
    userId: input.userId,
    type: input.activityType,
    // A prospect is not a Lead/Opportunity/Contact/Account, so this is a
    // standalone activity keyed to the prospect via externalId — the same
    // convention /api/leads/from-linkedin uses for "ProspectSaved".
    relatedKind: STANDALONE_KIND,
    relatedObjectId: STANDALONE_RELATED_ID,
    subject: descriptor.subject,
    detailNotes: descriptor.describe(profileName),
    occurredAt: input.occurredAt,
    sourceSystem: LINKEDIN_SOURCE_SYSTEM,
    externalId,
    outreach: {
      prospectId: prospect.id,
      linkedinProfileUrl,
      profileName,
      company,
      requestSentAt: input.occurredAt.toISOString(),
      initiatedBy: input.initiatedBy,
      source: LINKEDIN_SOURCE_SYSTEM,
      sourceLabel: LINKEDIN_SOURCE_LABEL,
    },
  });

  return { ok: true, activityId: activity.id, duplicate: Boolean(existing) };
}
