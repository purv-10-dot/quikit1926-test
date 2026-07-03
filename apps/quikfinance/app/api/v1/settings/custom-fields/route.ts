import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { customFieldSchema, slugifyField as slug } from "@/lib/settings/custom-field-shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const entity = new URL(request.url).searchParams.get("entity") ?? "contacts";
  try {
    const rows = (await prisma.$queryRaw`
      SELECT id, label, field_key, data_type, options, is_mandatory, show_in_portal, status, display_order
      FROM custom_field_definitions WHERE org_id = ${orgId}::uuid AND entity = ${entity}
      ORDER BY display_order ASC, created_at ASC`) as unknown[];
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown = {};
  try { body = await request.json(); } catch { body = {}; }
  const parsed = customFieldSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The custom field is invalid.", details: parsed.error.flatten() });

  try {
    const orderRows = (await prisma.$queryRaw`SELECT COALESCE(MAX(display_order), 0) + 1 AS n FROM custom_field_definitions WHERE org_id = ${orgId}::uuid AND entity = ${parsed.data.entity}`) as Array<{ n: number }>;
    const options = parsed.data.data_type === "dropdown" ? JSON.stringify(parsed.data.options ?? []) : null;
    const rows = (await prisma.$queryRaw`
      INSERT INTO custom_field_definitions (org_id, entity, label, field_key, data_type, options, is_mandatory, show_in_portal, display_order)
      VALUES (${orgId}::uuid, ${parsed.data.entity}, ${parsed.data.label}, ${slug(parsed.data.label)}, ${parsed.data.data_type},
        ${options}::jsonb, ${parsed.data.is_mandatory}, ${parsed.data.show_in_portal}, ${Number(orderRows[0]?.n ?? 1)})
      RETURNING id, label, field_key, data_type, options, is_mandatory, show_in_portal, status, display_order`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
