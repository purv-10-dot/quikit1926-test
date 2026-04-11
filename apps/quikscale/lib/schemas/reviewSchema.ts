import { z } from "zod";

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
  status: z.enum(["draft", "submitted", "finalized"]).optional(),
};

export const createReviewSchema = z.object(baseReview);
export const updateReviewSchema = z.object(baseReview).partial();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
