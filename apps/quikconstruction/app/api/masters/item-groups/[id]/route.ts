import { createIdRoutes } from "@/lib/api/masterFactory";
import { itemGroupUpdateSchema } from "@/lib/schemas/masters";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnItemGroup",
  updateSchema: itemGroupUpdateSchema,
  errorLabel: "Item Group",
});
