import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { departmentSchema } from "@/lib/validations/operations.schema";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT d.*, p.name AS parent_name
      FROM departments d LEFT JOIN departments p ON p.id = d.parent_id
      WHERE d.org_id = ${orgId}::uuid ORDER BY d.type DESC, d.name ASC
    `) as unknown[];
    return ok(rows, { total: rows.length, page: 1, per_page: rows.length });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = departmentSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The department is invalid.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    const rows = (await prisma.$queryRaw`
      INSERT INTO departments (org_id, name, code, type, parent_id, is_active)
      VALUES (${orgId}::uuid, ${d.name}, ${d.code ?? null}, ${d.type}, ${d.parent_id ?? null}::uuid, ${d.is_active})
      RETURNING *`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
