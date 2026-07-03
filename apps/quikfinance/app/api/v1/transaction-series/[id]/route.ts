import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { seriesSchema } from "@/lib/validations/transaction-series.schema";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can manage transaction series." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = seriesSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The series is invalid.", details: parsed.error.flatten() });

  try {
    if (parsed.data.is_default) {
      await prisma.$executeRaw`UPDATE transaction_series SET is_default = false WHERE org_id = ${orgId}::uuid AND id <> ${params.id}::uuid`;
    }
    await prisma.$executeRaw`
      UPDATE transaction_series SET name = ${parsed.data.name}, is_default = ${parsed.data.is_default}, config = ${JSON.stringify(parsed.data.config)}::jsonb, updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    const rows = (await prisma.$queryRaw`SELECT * FROM transaction_series WHERE id = ${params.id}::uuid`) as unknown[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Series was not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can manage transaction series." });
  try {
    const def = (await prisma.$queryRaw`SELECT is_default FROM transaction_series WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ is_default: boolean }>;
    if (!def.length) return fail(404, { code: "NOT_FOUND", message: "Series was not found." });
    if (def[0].is_default) return fail(409, { code: "DEFAULT_SERIES", message: "The default series cannot be deleted. Make another series the default first." });
    const used = (await prisma.$queryRaw`SELECT 1 FROM warehouses WHERE default_series_id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (used.length) return fail(409, { code: "IN_USE", message: "This series is assigned to a location. Reassign it first." });
    await prisma.$executeRaw`DELETE FROM transaction_series WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
