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

export const addRelatedLinkSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url(),
  type: z.string().max(40).optional(),
});
