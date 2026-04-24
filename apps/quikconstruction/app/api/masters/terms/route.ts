import { createListRoutes } from "@/lib/api/masterFactory";
import { termsCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnTermsCondition",
  createSchema: termsCreateSchema,
  orderBy: [{ applicableTo: "asc" }, { title: "asc" }],
  errorLabel: "Terms",
});
