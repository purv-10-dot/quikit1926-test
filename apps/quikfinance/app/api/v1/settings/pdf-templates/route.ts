import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { createTemplateSchema, defaultConfig, normalizeConfig } from "@/lib/pdf-templates/config";
import { presetByKey } from "@/lib/pdf-templates/catalog";

export const dynamic = "force-dynamic";

type Row = { id: string; module: string; name: string; base: string; config: unknown; is_default: boolean };

export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const module = request.nextUrl.searchParams.get("module") ?? "invoice";
  try {
    const rows = (await prisma.$queryRaw`
      SELECT id, module, name, base, config, is_default
      FROM pdf_templates WHERE org_id = ${orgId}::uuid AND module = ${module}
      ORDER BY is_default DESC, created_at ASC
    `) as Row[];
    return ok(rows.map((r) => ({ ...r, config: normalizeConfig(r.config) })));
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can manage templates." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid template.", details: parsed.error.flatten() });
  const { module, name, base, clone_from } = parsed.data;

  try {
    // Resolve the starting config: clone an existing template, use a gallery preset, or defaults.
    let config = parsed.data.config ? normalizeConfig({ ...defaultConfig(), ...parsed.data.config }) : null;
    if (!config && clone_from) {
      const src = (await prisma.$queryRaw`SELECT config FROM pdf_templates WHERE id = ${clone_from}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ config: unknown }>;
      if (src[0]) config = normalizeConfig(src[0].config);
    }
    if (!config) {
      const p = presetByKey(base);
      config = p ? p.config : defaultConfig();
    }

    // First template for a module becomes the default automatically.
    const countRows = (await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM pdf_templates WHERE org_id = ${orgId}::uuid AND module = ${module}`) as Array<{ n: number }>;
    const isDefault = (countRows[0]?.n ?? 0) === 0;

    const inserted = (await prisma.$queryRaw`
      INSERT INTO pdf_templates (org_id, module, name, base, config, is_default)
      VALUES (${orgId}::uuid, ${module}, ${name}, ${base}, ${JSON.stringify(config)}::jsonb, ${isDefault})
      RETURNING id
    `) as Array<{ id: string }>;
    return ok({ id: inserted[0].id, is_default: isDefault });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
