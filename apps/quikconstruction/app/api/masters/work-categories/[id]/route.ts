import { createIdRoutes } from "@/lib/api/masterFactory";
import { workCategoryUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnWorkCategory",
  updateSchema: workCategoryUpdateSchema,
  errorLabel: "Work Category",
});
