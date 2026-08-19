/**
 * Server-side writer for Upwork module activities.
 *
 * Mirrors log-linkedin-activity.ts: generic over the UPWORK_ACTIVITY_TYPES
 * registry, resolves the subject/description, builds the dedupe key, and hands
 * off to the shared logActivity() upsert. It creates NO Upwork-specific
 * activity storage — the row is an ordinary CrmActivity, so it counts toward
 * Activity Targets and appears in the global feed like every other activity.
 *
 * Standalone kind, same as prospects: an Upwork job is not a
 * Lead/Opportunity/Contact/Account, so relatedKind is the "None" sentinel and
 * the job id lives in `externalId` (which is also how the job's timeline is
 * queried) plus `outreach` for display metadata.
 */
import { logActivity } from "@/lib/services/activities/log-activity";
import {
  STANDALONE_KIND,
  STANDALONE_RELATED_ID,
} from "@/lib/services/activities/target-existence";
import {
  UPWORK_ACTIVITY_TYPES,
  UPWORK_SOURCE_LABEL,
  UPWORK_SOURCE_SYSTEM,
  buildUpworkActivityExternalId,
  type UpworkActivityType,
} from "@/lib/services/activities/upwork-activity-types";

export type LogUpworkActivityInput = {
  orgId: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  activityType: UpworkActivityType;
  jobUrl?: string | null;
  clientLocation?: string | null;
  occurredAt?: Date;
  /**
   * Prospect this job was converted to. Set only by
   * UPWORK_CONVERTED_TO_PROSPECT; recorded in the activity metadata so the
   * timeline entry says what it converted to, without duplicating prospect data
   * anywhere.
   */
  prospect?: { id: string; name: string } | null;
};

/**
 * Log an activity against a captured Upwork job.
 *
 * The caller is responsible for having already verified the job belongs to
 * `orgId` — this is invoked immediately after createUpworkJob, which resolved
 * the org from the session, so there is no id to re-validate here (unlike the
 * LinkedIn writer, whose prospectId arrives from the client).
 *
 * Idempotent: `oncePerJob` types key on `<jobId>:<type>`, and logActivity()
 * upserts on (orgId, sourceSystem, externalId). Re-adding a job that is already
 * in CRM therefore produces no second timeline row — matching the requirement
 * that a duplicate capture must not duplicate the activity.
 */
export async function logUpworkActivity(input: LogUpworkActivityInput) {
  const descriptor = UPWORK_ACTIVITY_TYPES[input.activityType];
  const occurredAt = input.occurredAt ?? new Date();
  const jobTitle = input.jobTitle.trim() || "Untitled job";

  const externalId = buildUpworkActivityExternalId(
    input.activityType,
    input.jobId,
    occurredAt,
  );

  return logActivity({
    orgId: input.orgId,
    userId: input.userId,
    type: input.activityType,
    relatedKind: STANDALONE_KIND,
    relatedObjectId: STANDALONE_RELATED_ID,
    subject: descriptor.subject(jobTitle),
    detailNotes: descriptor.describe(jobTitle),
    occurredAt,
    sourceSystem: UPWORK_SOURCE_SYSTEM,
    externalId,
    outreach: {
      upworkJobId: input.jobId,
      jobTitle,
      jobUrl: input.jobUrl ?? null,
      clientLocation: input.clientLocation ?? null,
      source: UPWORK_SOURCE_SYSTEM,
      sourceLabel: UPWORK_SOURCE_LABEL,
      ...(input.prospect
        ? { prospectId: input.prospect.id, prospectName: input.prospect.name }
        : {}),
    },
  });
}
