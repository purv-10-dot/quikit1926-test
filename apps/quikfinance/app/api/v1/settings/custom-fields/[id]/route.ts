import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { customFieldSchema } from "@/lib/settings/custom-field-shared";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const patchSchema = customFieldSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() });

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown = {};
  try { body = await request.json(); } catch { body = {}; }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid field update.", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    const options = d.data_type === "dropdown" ? JSON.stringify(d.options ?? []) : undefined;
    await prisma.$executeRaw`
      UPDATE custom_field_definitions SET
        label = COALESCE(${d.label ?? null}, label),
        data_type = COALESCE(${d.data_type ?? null}, data_type),
        is_mandatory = COALESCE(${d.is_mandatory ?? null}, is_mandatory),
        show_in_portal = COALESCE(${d.show_in_portal ?? null}, show_in_portal),
        status = COALESCE(${d.status ?? null}, status),
        options = COALESCE(${options ?? null}::jsonb, options),
        updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    const rows = (await prisma.$queryRaw`SELECT id, label, field_key, data_type, options, is_mandatory, show_in_portal, status, display_order FROM custom_field_definitions WHERE id = ${params.id}::uuid`) as unknown[];
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
    await prisma.$executeRaw`DELETE FROM custom_field_definitions WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
