import { createIdRoutes } from "@/lib/api/masterFactory";
import { costCenterUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnCostCenter",
  updateSchema: costCenterUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Cost Center",
});
