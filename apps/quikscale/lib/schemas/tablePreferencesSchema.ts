import { z } from "zod";

export const updateTablePreferencesSchema = z.object({
  table: z.enum(["kpi", "priority", "www"]),
  frozenCol: z.string().nullable().optional(),
  hiddenCols: z.array(z.string()).nullable().optional(),
  sort: z.string().nullable().optional(), // format: "colKey:asc" | "colKey:desc"
  colWidths: z.record(z.string(), z.number()).nullable().optional(),
});
