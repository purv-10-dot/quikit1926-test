import { z } from "zod";

/**
 * Performance Review statuses — the R10d 7-state cycle
 * (upgraded from the legacy draft | submitted | finalized).
 *
 * Expected flow:
 *   draft           → reviewer starts, nothing sent
 *   self-assessment → reviewee fills in their own view first
 *   manager-review  → back to manager to write/complete
 *   calibration     → admin-only calibration round across the team
 *   approved        → locked after calibration
 *   shared          → visible to the reviewee (conversation held)
 *   signed          → acknowledged by the reviewee
 *
 * Legacy values `submitted` and `finalized` remain valid in the schema
 * so existing records don't fail validation during migration.
 */
export const REVIEW_STATUSES = [
  "draft",
  "self-assessment",
  "manager-review",
  "calibration",
  "approved",
  "shared",
  "signed",
  // Legacy values kept for backward compatibility with existing data
  "submitted",
  "finalized",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const baseReview = {
  revieweeId: z.string().min(1, "Reviewee is required"),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  rating: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).optional().nullable(),
  strengths: z.string().max(5000).optional().nullable(),
  improvements: z.string().max(5000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  kpiScore: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).optional().nullable(),
  priorityScore: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).optional().nullable(),
  attendanceScore: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).optional().nullable(),
  overallScore: z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).optional().nullable(),
  status: z.enum(REVIEW_STATUSES).optional(),
};

export const createReviewSchema = z.object(baseReview);
export const updateReviewSchema = z.object(baseReview).partial();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
