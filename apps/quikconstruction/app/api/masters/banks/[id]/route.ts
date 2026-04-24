import { createIdRoutes } from "@/lib/api/masterFactory";
import { bankUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnBank",
  updateSchema: bankUpdateSchema,
  uniqueBy: "accountNo",
  errorLabel: "Bank account",
});
