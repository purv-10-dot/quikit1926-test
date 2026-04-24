import { createListRoutes } from "@/lib/api/masterFactory";
import { tdsCodeCreateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, POST } = createListRoutes({
  model: "cnTDSCode",
  createSchema: tdsCodeCreateSchema,
  orderBy: { section: "asc" },
  uniqueBy: "section",
  errorLabel: "TDS Code",
});
