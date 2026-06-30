import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(20).optional(),
  type: z.enum(["business", "warehouse"]).optional(),
  default_series_id: z.string().uuid().optional().nullable(),
  address: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  notes: z.string().optional().nullable()
});

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can edit locations." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The location is invalid.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    if (d.is_default) await prisma.$executeRaw`UPDATE warehouses SET is_default = false WHERE org_id = ${orgId}::uuid AND id <> ${params.id}::uuid`;
    await prisma.$executeRaw`
      UPDATE warehouses SET
        name = COALESCE(${d.name ?? null}, name),
        code = COALESCE(${d.code ?? null}, code),
        type = COALESCE(${d.type ?? null}, type),
        default_series_id = ${d.default_series_id ?? null}::uuid,
        address = COALESCE(${d.address ? JSON.stringify(d.address) : null}::jsonb, address),
        is_active = COALESCE(${d.is_active ?? null}, is_active),
        is_default = COALESCE(${d.is_default ?? null}, is_default),
        notes = ${d.notes ?? null},
        updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    const rows = (await prisma.$queryRaw`SELECT * FROM warehouses WHERE id = ${params.id}::uuid`) as unknown[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Location was not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can delete locations." });
  try {
    await prisma.$executeRaw`DELETE FROM warehouses WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
