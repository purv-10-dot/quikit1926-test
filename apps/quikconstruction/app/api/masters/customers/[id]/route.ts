import { createIdRoutes } from "@/lib/api/masterFactory";
import { customerUpdateSchema } from "@/lib/schemas/masters";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnCustomer",
  updateSchema: customerUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Customer",
});
