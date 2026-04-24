import { createIdRoutes } from "@/lib/api/masterFactory";
import { locationUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnLocation",
  updateSchema: locationUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Location",
});
