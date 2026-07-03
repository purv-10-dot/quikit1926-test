import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { updateTemplateSchema, normalizeConfig } from "@/lib/pdf-templates/config";

export const dynamic = "force-dynamic";

type Row = { id: string; module: string; name: string; base: string; config: unknown; is_default: boolean };

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT id, module, name, base, config, is_default FROM pdf_templates WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Row[];
    if (!rows[0]) return fail(404, { code: "NOT_FOUND", message: "Template not found." });
    return ok({ ...rows[0], config: normalizeConfig(rows[0].config) });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can manage templates." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid template.", details: parsed.error.flatten() });

  try {
    if (parsed.data.name !== undefined) {
      await prisma.$executeRaw`UPDATE pdf_templates SET name = ${parsed.data.name}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    }
    if (parsed.data.config !== undefined) {
      await prisma.$executeRaw`UPDATE pdf_templates SET config = ${JSON.stringify(parsed.data.config)}::jsonb, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    }
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can manage templates." });

  try {
    const rows = (await prisma.$queryRaw`SELECT module, is_default FROM pdf_templates WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ module: string; is_default: boolean }>;
    if (!rows[0]) return fail(404, { code: "NOT_FOUND", message: "Template not found." });
    await prisma.$executeRaw`DELETE FROM pdf_templates WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    // If we removed the default, promote the next oldest template for that module.
    if (rows[0].is_default) {
      await prisma.$executeRaw`
        UPDATE pdf_templates SET is_default = true, updated_at = now()
        WHERE id = (SELECT id FROM pdf_templates WHERE org_id = ${orgId}::uuid AND module = ${rows[0].module} ORDER BY created_at ASC LIMIT 1)
      `;
    }
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
