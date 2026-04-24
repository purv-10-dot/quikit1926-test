import { createIdRoutes } from "@/lib/api/masterFactory";
import { itemUpdateSchema } from "@/lib/schemas/masters";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnItem",
  updateSchema: itemUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Item",
});
