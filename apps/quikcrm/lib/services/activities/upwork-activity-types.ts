/**
 * Upwork activity registry.
 *
 * Mirrors linkedin-activity-types.ts: a single source of truth for every
 * activity the Upwork module can log, so adding a future action (proposal
 * submitted, client replied, …) is one entry here rather than an edit spread
 * across the writer, the dedupe key, and the UI.
 *
 * `CrmActivity.type` is a free-form String column and no consumer switches on a
 * fixed set — Activity Targets and the dashboards count rows by
 * orgId/occurredAt/owner with no type whitelist. So new types need no migration
 * and are counted automatically.
 */

/** Marks every row written by the Upwork module. Also the dedupe namespace. */
export const UPWORK_SOURCE_SYSTEM = "upwork-extension" as const;

/** Human-facing provenance stored on the activity metadata. */
export const UPWORK_SOURCE_LABEL = "Upwork Extension" as const;

type UpworkActivityDescriptor = {
  /** Fixed subject prefix shown in the timeline; the job title is appended. */
  subject: (jobTitle: string) => string;
  /** Builds the description body. */
  describe: (jobTitle: string) => string;
  /**
   * Whether one activity of this type may exist per job (true) or the action
   * can legitimately repeat (false).
   *
   * Capture is once-per-job: the job row itself is deduped on
   * (orgId, dedupeKey), so a re-add must not append a second timeline row
   * either. Its dedupe key therefore omits the timestamp.
   */
  oncePerJob: boolean;
};

export const UPWORK_ACTIVITY_TYPES = {
  UPWORK_JOB_SAVED: {
    subject: (jobTitle) => `Saved Upwork job: ${jobTitle}`,
    describe: (jobTitle) => `Added the Upwork job "${jobTitle}" to CRM.`,
    oncePerJob: true,
  },
  /**
   * Logged when an Upwork job is converted to a prospect. Once per job, for the
   * same reason the conversion itself is: @@unique([orgId, upworkJobId]) allows
   * exactly one prospect per job, so a second timeline row could never be
   * legitimate.
   */
  UPWORK_CONVERTED_TO_PROSPECT: {
    subject: (jobTitle) => `Upwork job converted to Prospect: ${jobTitle}`,
    describe: (jobTitle) =>
      `Converted the Upwork job "${jobTitle}" to a prospect.`,
    oncePerJob: true,
  },
} as const satisfies Record<string, UpworkActivityDescriptor>;

export type UpworkActivityType = keyof typeof UPWORK_ACTIVITY_TYPES;

/** Non-empty tuple form, for `z.enum()` which requires at least one member. */
export const UPWORK_ACTIVITY_TYPE_VALUES = Object.keys(
  UPWORK_ACTIVITY_TYPES,
) as [UpworkActivityType, ...UpworkActivityType[]];

export function isUpworkActivityType(v: string): v is UpworkActivityType {
  return Object.prototype.hasOwnProperty.call(UPWORK_ACTIVITY_TYPES, v);
}

/**
 * Dedupe key written to `CrmActivity.externalId`, paired with
 * `sourceSystem = "upwork-extension"` to hit the
 * `@@unique([orgId, sourceSystem, externalId])` index. logActivity() upserts on
 * that pair, so a replayed call is a database-level no-op rather than a second
 * timeline row.
 *
 * JOB ID FIRST, deliberately. This key is also how the job's timeline is found:
 * a standalone activity (relatedKind "None") cannot be located by
 * relatedObjectId, so the detail page queries
 * `sourceSystem = upwork-extension AND externalId startsWith "<jobId>:"`.
 * Leading with the job id makes that a prefix match — index-friendly and exact,
 * where a trailing id would force a contains/endsWith scan. Keeping both the
 * writer and the reader in this file means the format cannot drift.
 */
export function buildUpworkActivityExternalId(
  activityType: UpworkActivityType,
  jobId: string,
  occurredAt: Date,
): string {
  const base = `${jobId}:${activityType}`;
  return UPWORK_ACTIVITY_TYPES[activityType].oncePerJob
    ? base
    : `${base}:${occurredAt.toISOString()}`;
}

/**
 * The `externalId` prefix shared by every activity belonging to one job — the
 * read side of buildUpworkActivityExternalId. The trailing colon matters: it
 * stops job id "abc" from also matching a hypothetical "abcdef".
 */
export function upworkActivityExternalIdPrefix(jobId: string): string {
  return `${jobId}:`;
}

/**
 * externalId for a user-logged activity against an Upwork job (Log Activity →
 * Link to → Upwork), as opposed to the system events in
 * UPWORK_ACTIVITY_TYPES above.
 *
 * Shares the `<jobId>:` prefix so these rows appear on the job's timeline
 * through the SAME query the system events use — that prefix is the read key,
 * so a user-logged activity must carry it or it would be invisible on the job.
 *
 * The `MANUAL:` segment plus the activity row id keeps the key unique and
 * namespaced away from every registry type, so:
 *   - it can never collide with an `oncePerJob` key and silently upsert over a
 *     system event, and
 *   - logging the same activity type against the same job twice is allowed
 *     (unlike capture, a user may legitimately log two calls about one job).
 *
 * Taking the activity id (not a timestamp) as the discriminator means the key is
 * derived from the row itself, so two activities logged in the same millisecond
 * still get distinct keys.
 */
export function buildManualUpworkActivityExternalId(
  jobId: string,
  activityId: string,
): string {
  return `${jobId}:MANUAL:${activityId}`;
}
