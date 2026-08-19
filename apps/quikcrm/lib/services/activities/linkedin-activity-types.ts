/**
 * LinkedIn activity registry.
 *
 * Single source of truth for every activity the LinkedIn extension can log.
 * `POST /api/linkedin/activity` is generic over this table: it validates the
 * posted `activityType` against the keys here and derives the subject from the
 * matching descriptor. Adding a future action (LINKEDIN_MESSAGE_SENT,
 * LINKEDIN_CONNECTION_ACCEPTED, …) is a new entry in this object — the route,
 * the Zod schema, and the dedupe logic all pick it up with no other edit.
 *
 * `CrmActivity.type` is a free-form String column (see schema.prisma) and no
 * consumer switches on a fixed set — Activity Targets and the dashboards count
 * rows by orgId/occurredAt/owner with no type whitelist. So new types here
 * require no migration and are counted automatically.
 */

/** Marks every row written by the extension. Also the dedupe namespace. */
export const LINKEDIN_SOURCE_SYSTEM = "linkedin-extension" as const;

/** Human-facing provenance stored on the activity metadata. */
export const LINKEDIN_SOURCE_LABEL = "LinkedIn Extension" as const;

type LinkedInActivityDescriptor = {
  /** Fixed subject line shown in the timeline. */
  subject: string;
  /** Builds the description body. `name` is the prospect's display name. */
  describe: (name: string) => string;
  /**
   * Whether one activity of this type may exist per prospect (true) or the
   * action can legitimately repeat (false).
   *
   * A connection request is once-per-prospect: re-clicking must not add a
   * second timeline row, so its dedupe key omits the timestamp. A message or a
   * profile view can happen many times, so those keys include the occurrence
   * time and each one lands as its own row.
   */
  oncePerProspect: boolean;
};

export const LINKEDIN_ACTIVITY_TYPES = {
  LINKEDIN_CONNECTION_SENT: {
    subject: "LinkedIn Connection Request Sent",
    describe: (name) => `Connection request sent to ${name} from LinkedIn.`,
    oncePerProspect: true,
  },
  // ── Future actions ────────────────────────────────────────────────────────
  // Wired end-to-end already: the endpoint accepts these today. Only the
  // extension-side trigger is missing.
  LINKEDIN_CONNECTION_ACCEPTED: {
    subject: "LinkedIn Connection Accepted",
    describe: (name) => `${name} accepted the LinkedIn connection request.`,
    oncePerProspect: true,
  },
  LINKEDIN_MESSAGE_SENT: {
    subject: "LinkedIn Message Sent",
    describe: (name) => `Message sent to ${name} on LinkedIn.`,
    oncePerProspect: false,
  },
  LINKEDIN_MESSAGE_RECEIVED: {
    subject: "LinkedIn Message Received",
    describe: (name) => `Message received from ${name} on LinkedIn.`,
    oncePerProspect: false,
  },
  LINKEDIN_PROFILE_VIEWED: {
    subject: "LinkedIn Profile Viewed",
    describe: (name) => `Viewed ${name}'s LinkedIn profile.`,
    oncePerProspect: false,
  },
  LINKEDIN_POST_SYNCED: {
    subject: "LinkedIn Posts Synced",
    describe: (name) => `Synced LinkedIn posts for ${name}.`,
    oncePerProspect: false,
  },
  LINKEDIN_INMAIL_SENT: {
    subject: "LinkedIn InMail Sent",
    describe: (name) => `InMail sent to ${name} on LinkedIn.`,
    oncePerProspect: false,
  },
} as const satisfies Record<string, LinkedInActivityDescriptor>;

export type LinkedInActivityType = keyof typeof LINKEDIN_ACTIVITY_TYPES;

/** Non-empty tuple form, for `z.enum()` which requires at least one member. */
export const LINKEDIN_ACTIVITY_TYPE_VALUES = Object.keys(
  LINKEDIN_ACTIVITY_TYPES,
) as [LinkedInActivityType, ...LinkedInActivityType[]];

export function isLinkedInActivityType(v: string): v is LinkedInActivityType {
  return Object.prototype.hasOwnProperty.call(LINKEDIN_ACTIVITY_TYPES, v);
}

/**
 * Dedupe key written to `CrmActivity.externalId`, paired with
 * `sourceSystem = "linkedin-extension"` to hit the
 * `@@unique([orgId, sourceSystem, externalId])` index. logActivity() upserts on
 * that pair, so a replayed call is a database-level no-op rather than a
 * second timeline row.
 *
 * Once-per-prospect types key on `<type>:<prospectId>` — stable across retries,
 * double-clicks, and re-visits. Repeatable types append the occurrence
 * timestamp so distinct occurrences stay distinct while an accidental retry of
 * the *same* occurrence (identical timestamp) still collapses.
 */
export function buildLinkedInActivityExternalId(
  activityType: LinkedInActivityType,
  prospectId: string,
  occurredAt: Date,
): string {
  const base = `${activityType}:${prospectId}`;
  return LINKEDIN_ACTIVITY_TYPES[activityType].oncePerProspect
    ? base
    : `${base}:${occurredAt.toISOString()}`;
}
