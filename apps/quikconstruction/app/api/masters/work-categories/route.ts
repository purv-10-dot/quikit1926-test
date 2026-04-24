import { createListRoutes } from "@/lib/api/masterFactory";
import { workCategoryCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnWorkCategory",
  createSchema: workCategoryCreateSchema,
  orderBy: { name: "asc" },
  errorLabel: "Work Category",
});
