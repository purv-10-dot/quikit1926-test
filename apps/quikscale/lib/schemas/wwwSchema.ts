import { z } from "zod";

export const WWW_CATEGORIES = ["eNPS", "cNPS", "Others"] as const;
export type WWWCategory = (typeof WWW_CATEGORIES)[number];

export const createWWWSchema = z
  .object({
    // Legacy single-assignee field. Optional now — clients may send `whoIds`
    // instead. When both are present, `whoIds[0]` wins.
    who:             z.string().min(1).optional(),
    whoIds:          z.array(z.string().min(1)).optional(),
    // No length cap on user-content fields — Prisma columns are `text`.
    what:            z.string().min(1, "What is required"),
    // Optional at the field level — the cross-field refine below requires
    // EITHER a date OR the To-Be-Decided flag.
    when:            z.string().min(1).optional(),
    dueDateTBD:      z.boolean().optional().default(false),
    status:          z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","in-progress","blocked"]).default("not-yet-started"),
    notes:           z.string().optional().nullable(),
    category:        z.enum(["eNPS", "cNPS", "Others"]).optional().nullable(),
    originalDueDate: z.string().optional().nullable(),
  })
  .refine(
    (v) => (v.whoIds && v.whoIds.length > 0) || !!v.who,
    { message: "At least one assignee is required", path: ["whoIds"] },
  )
  // Exactly one of the two must identify the due date. Marking TBD *and*
  // sending a date is accepted — TBD wins, and the date is ignored (the
  // client clears it, but a stale value shouldn't 400 the request).
  .refine(
    (v) => v.dueDateTBD === true || !!v.when,
    { message: "Select a due date or mark it To Be Decided", path: ["when"] },
  );

// Update — fully partial so PATCH-style updates work. Length/enum rules
// still enforced when the field is present.
export const updateWWWSchema = z.object({
  who:             z.string().min(1).optional(),
  whoIds:          z.array(z.string().min(1)).optional(),
  what:            z.string().min(1).optional(),
  when:            z.string().min(1).optional(),
  dueDateTBD:      z.boolean().optional(),
  status:          z.enum(["not-applicable","not-yet-started","behind-schedule","on-track","completed","in-progress","blocked"]).optional(),
  notes:           z.string().optional().nullable(),
  category:        z.enum(["eNPS", "cNPS", "Others"]).optional().nullable(),
  originalDueDate: z.string().optional().nullable(),
  revisedDates:    z.array(z.string()).optional(),
});

export type CreateWWWInput = z.infer<typeof createWWWSchema>;
export type UpdateWWWInput = z.infer<typeof updateWWWSchema>;
