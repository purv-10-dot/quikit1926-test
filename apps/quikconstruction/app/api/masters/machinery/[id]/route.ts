import { createIdRoutes } from "@/lib/api/masterFactory";
import { machineryUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnMachinery",
  updateSchema: machineryUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Machinery",
});
