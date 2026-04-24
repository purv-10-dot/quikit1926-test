import { createIdRoutes } from "@/lib/api/masterFactory";
import { contractorUpdateSchema } from "@/lib/schemas/masters";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnContractor",
  updateSchema: contractorUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Contractor",
});
