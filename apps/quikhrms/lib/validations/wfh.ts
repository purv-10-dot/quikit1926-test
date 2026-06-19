import { z } from "zod";

export const createWfhSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isHalfDay: z.boolean().default(false),
  session: z.enum(["FullDay", "FirstHalf", "SecondHalf"]).default("FullDay"),
  reason: z.string().min(1, "Reason is required").max(2000),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
}).refine((d) => new Date(d.startDate).getTime() <= new Date(d.endDate).getTime(), {
  message: "Start date must be on or before end date",
  path: ["endDate"],
}).refine((d) => !d.isHalfDay || d.startDate === d.endDate, {
  message: "Half-day WFH must be a single date",
  path: ["isHalfDay"],
});

export const decideWfhSchema = z.object({
  comment: z.string().max(1000).optional(),
});
