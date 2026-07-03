import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { departmentSchema } from "@/lib/validations/operations.schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = departmentSchema.partial().safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The department is invalid.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    await prisma.$executeRaw`
      UPDATE departments SET
        name = COALESCE(${d.name ?? null}, name),
        code = ${d.code ?? null},
        type = COALESCE(${d.type ?? null}, type),
        parent_id = ${d.parent_id ?? null}::uuid,
        is_active = COALESCE(${d.is_active ?? null}, is_active),
        updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    const rows = (await prisma.$queryRaw`SELECT * FROM departments WHERE id = ${params.id}::uuid`) as unknown[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Department was not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const used = (await prisma.$queryRaw`SELECT 1 FROM budgets WHERE department_id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (used.length) return fail(409, { code: "IN_USE", message: "This department is used by a budget. Reassign or delete those budgets first." });
    await prisma.$executeRaw`DELETE FROM departments WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
