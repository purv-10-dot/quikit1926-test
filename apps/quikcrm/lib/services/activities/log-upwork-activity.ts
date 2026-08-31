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

/**
 * The linkable activity kind for a captured Upwork job. Matches the value
 * already registered in ACTIVITY_PRIMARY_KINDS / validated by
 * assertActivityTargetExists.
 */
const UPWORK_RELATED_KIND = "Upwork" as const;
import {
  UPWORK_ACTIVITY_TYPES,
  UPWORK_SOURCE_LABEL,
  UPWORK_SOURCE_SYSTEM,
  buildUpworkActivityExternalId,
  buildUpworkMessageExternalId,
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

/**
 * One scraped message from an Upwork Messages room, logged against the job the
 * user confirmed it belongs to.
 *
 * Association is the caller's responsibility and is NEVER inferred here: the
 * extension resolves a candidate job, the user confirms it in the panel, and the
 * confirmed `jobId` arrives explicitly. This function does not match on titles
 * or message text.
 *
 * Idempotent per message: `externalId` is `<jobId>:MSG:<upworkMessageId>` and
 * logActivity() upserts on (orgId, sourceSystem, externalId), so re-extracting a
 * room rewrites the same rows instead of appending duplicates. Callers that have
 * no Upwork message id must not invent one — see the extension's
 * synthesiseMessageId, which derives a stable per-thread fallback rather than a
 * random value.
 */
export async function logUpworkConversationMessage(input: {
  orgId: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  message: {
    id: string;
    text: string;
    senderName?: string | null;
    senderType?: "client" | "user" | null;
    sentAt?: Date | null;
    order?: number | null;
  };
  conversation: {
    threadId?: string | null;
    url?: string | null;
    clientName?: string | null;
  };
}) {
  const jobTitle = input.jobTitle.trim() || "Untitled job";
  const { message, conversation } = input;
  // occurredAt drives timeline ordering. Upwork often renders only a relative
  // time ("2 days ago"); when the scraper could not resolve an absolute date it
  // sends null, and now() is the honest fallback rather than a fabricated date.
  const occurredAt = message.sentAt ?? new Date();
  const who = message.senderName?.trim() || (message.senderType === "user" ? "You" : "Client");

  return logActivity({
    orgId: input.orgId,
    userId: input.userId,
    type: "UPWORK_CONVERSATION_MESSAGE",
    // EXPLICITLY related to the job — not standalone like the system events
    // above. `relatedKind: "Upwork"` is already a first-class linkable kind
    // (ACTIVITY_PRIMARY_KINDS), validated against crmUpworkJob by
    // assertActivityTargetExists and exempted from the account ACL by
    // ACCOUNTLESS_KINDS, so this needs no schema or API change.
    //
    // The `<jobId>:` externalId prefix below is still REQUIRED and must not be
    // dropped: UpworkActivityTimeline queries the job's timeline purely by
    // (sourceSystem, externalId startsWith "<jobId>:"), never by
    // relatedObjectId. Removing the prefix would make every message vanish from
    // the job page even though the row is correctly related.
    relatedKind: UPWORK_RELATED_KIND,
    relatedObjectId: input.jobId,
    subject: `Upwork message from ${who}: ${jobTitle}`,
    detailNotes: message.text,
    occurredAt,
    sourceSystem: UPWORK_SOURCE_SYSTEM,
    externalId: buildUpworkMessageExternalId(input.jobId, message.id),
    outreach: {
      upworkJobId: input.jobId,
      jobTitle,
      source: UPWORK_SOURCE_SYSTEM,
      sourceLabel: UPWORK_SOURCE_LABEL,
      kind: "conversationMessage",
      messageId: message.id,
      senderName: message.senderName ?? null,
      senderType: message.senderType ?? null,
      messageOrder: message.order ?? null,
      // Null when Upwork rendered only a relative time — recorded so a reader
      // can tell "sent then" from "scraped then" (occurredAt above).
      sentAt: message.sentAt ? message.sentAt.toISOString() : null,
      conversationThreadId: conversation.threadId ?? null,
      conversationUrl: conversation.url ?? null,
      clientName: conversation.clientName ?? null,
    },
  });
}
