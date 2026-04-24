import { createListRoutes } from "@/lib/api/masterFactory";
import { gstCodeCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnGSTCode",
  createSchema: gstCodeCreateSchema,
  orderBy: { rate: "asc" },
  uniqueBy: "code",
  errorLabel: "GST Code",
});
