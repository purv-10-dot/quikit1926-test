import { createIdRoutes } from "@/lib/api/masterFactory";
import { tdsCodeUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnTDSCode",
  updateSchema: tdsCodeUpdateSchema,
  uniqueBy: "section",
  errorLabel: "TDS Code",
});
