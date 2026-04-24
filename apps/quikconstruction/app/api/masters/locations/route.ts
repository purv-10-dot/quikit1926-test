import { createListRoutes } from "@/lib/api/masterFactory";
import { locationCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnLocation",
  createSchema: locationCreateSchema,
  orderBy: { name: "asc" },
  uniqueBy: "code",
  errorLabel: "Location",
});
