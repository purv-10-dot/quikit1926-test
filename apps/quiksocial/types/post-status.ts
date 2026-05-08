/**
 * PostStatus — canonical status values for the Post model.
 *
 * Flow:
 *   draft → review → approved → scheduled → published
 *                                    ↓
 *                                 failed / overdue
 *
 * Rejection is NOT a permanent status. The post returns to "draft"
 * with a rejectionNote so the member can fix and resubmit.
 */
export enum PostStatus {
  Draft = "draft",
  Review = "review",        // submitted by member, awaiting admin action
  Approved = "approved",    // admin approved, no scheduled time set yet
  Scheduled = "scheduled",  // approved + scheduledFor set, queued for publishing
  Published = "published",  // live on platform
  Failed = "failed",        // publish attempt failed — retry available
  Overdue = "overdue",      // scheduledFor passed without being published — does NOT auto-publish
}

/** Statuses visible to members */
export const MEMBER_VISIBLE_STATUSES: PostStatus[] = [
  PostStatus.Draft,
  PostStatus.Review,
  PostStatus.Approved,
  PostStatus.Scheduled,
  PostStatus.Published,
  PostStatus.Failed,
  PostStatus.Overdue,
];

/** Statuses that allow a member to submit for review */
export const SUBMITTABLE_STATUSES: PostStatus[] = [PostStatus.Draft];

/** Statuses that an admin can approve */
export const APPROVABLE_STATUSES: PostStatus[] = [PostStatus.Review];

/** Statuses that an admin can reject (returns post to draft) */
export const REJECTABLE_STATUSES: PostStatus[] = [PostStatus.Review];
