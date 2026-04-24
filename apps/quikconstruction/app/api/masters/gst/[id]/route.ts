import { createIdRoutes } from "@/lib/api/masterFactory";
import { gstCodeUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnGSTCode",
  updateSchema: gstCodeUpdateSchema,
  uniqueBy: "code",
  errorLabel: "GST Code",
});
