import { z } from "zod";

/**
 * Body for the per-module row-reorder endpoints. `beforeId`/`afterId` are the
 * ids of the rows that will sandwich the moved row in the new order (either may
 * be null at the top/bottom of the list). Computed client-side by
 * `rowNeighbors()` from the visible ordered rows.
 */
export const reorderRowSchema = z.object({
  id: z.string().min(1),
  beforeId: z.string().min(1).nullable(),
  afterId: z.string().min(1).nullable(),
});

export type ReorderRowBody = z.infer<typeof reorderRowSchema>;
