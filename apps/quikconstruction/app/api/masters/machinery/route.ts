import { createListRoutes } from "@/lib/api/masterFactory";
import { machineryCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnMachinery",
  createSchema: machineryCreateSchema,
  orderBy: { code: "asc" },
  uniqueBy: "code",
  errorLabel: "Machinery",
});
