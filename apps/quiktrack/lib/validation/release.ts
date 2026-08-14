import { z } from "zod";

export const RELEASE_STATUSES = ["UNRELEASED", "RELEASED", "ARCHIVED"] as const;

export const createReleaseSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  releaseDate: z.string().datetime().optional(),
  driverId: z.string().optional(),
});

export const updateReleaseSchema = createReleaseSchema
  .partial()
  .omit({ projectId: true })
  .extend({
    status: z.enum(RELEASE_STATUSES).optional(),
  });

export const addWorkItemsSchema = z.object({
  issueIds: z.array(z.string().min(1)).min(1),
});

export const addApproverSchema = z.object({
  userId: z.string().min(1),
});

export const RELEASE_APPROVER_ACT_STATUSES = ["APPROVED", "CHANGES_REQUESTED"] as const;

export const actApproverSchema = z.object({
  status: z.enum(RELEASE_APPROVER_ACT_STATUSES),
  comment: z.string().max(2000).optional(),
});

export const RELATED_LINK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"] as const;

export const addRelatedLinkSchema = z.object({
  title: z.string().min(1).max(200),
  // Optional — a row created from the template picker starts as a
  // placeholder card with no URL yet.
  url: z.string().url().optional(),
  type: z.string().max(40).optional(),
});

export const updateRelatedLinkSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  url: z.string().url().nullable().optional(),
  status: z.enum(RELATED_LINK_STATUSES).optional(),
  assigneeId: z.string().nullable().optional(),
  // Unlink action sends `issueId: null` to detach without deleting the row.
  issueId: z.null().optional(),
});

/** "Link work item" — attaches a real QtIssue to an EXISTING related-work
 * placeholder row (identified by linkId), replacing its freeform title/url
 * with the issue's key/title. No new row is created. */
export const linkWorkItemSchema = z.object({
  issueId: z.string().min(1),
  linkId: z.string().min(1),
});
