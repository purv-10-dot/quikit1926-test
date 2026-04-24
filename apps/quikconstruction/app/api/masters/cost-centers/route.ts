import { createListRoutes } from "@/lib/api/masterFactory";
import { costCenterCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnCostCenter",
  createSchema: costCenterCreateSchema,
  orderBy: { code: "asc" },
  uniqueBy: "code",
  errorLabel: "Cost Center",
});
