import { createIdRoutes } from "@/lib/api/masterFactory";
import { termsUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnTermsCondition",
  updateSchema: termsUpdateSchema,
  errorLabel: "Terms",
});
