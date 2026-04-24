import { createIdRoutes } from "@/lib/api/masterFactory";
import { departmentUpdateSchema } from "@/lib/schemas/masters-phase2";

export const { GET, PATCH, DELETE } = createIdRoutes({
  model: "cnDepartment",
  updateSchema: departmentUpdateSchema,
  uniqueBy: "code",
  errorLabel: "Department",
});
