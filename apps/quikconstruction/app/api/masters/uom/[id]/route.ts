import { createIdRoutes } from "@/lib/api/masterFactory";
import { uomUpdateSchema } from "@/lib/schemas/masters";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnUOM",
  updateSchema: uomUpdateSchema,
  uniqueBy: "code",
  errorLabel: "UOM",
});
